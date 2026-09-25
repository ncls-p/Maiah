import type { PoolClient } from "pg";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
function query(client: PoolClient, statement: SQL) {
  const compiled = dialect.sqlToQuery(statement);
  return client.query(compiled.sql, compiled.params);
}
import { MAX_ARCHIVE_BYTES, MAX_ROWS } from "./archive";
import {
  emptyDataset,
  quote,
  tables,
  type Dataset,
  type Row,
} from "./registry";

export async function assertDatabaseSchema(client: PoolClient) {
  const result = await client.query<{
    table_name: string;
    column_name: string;
  }>(
    "select table_name, column_name from information_schema.columns where table_schema = 'public' order by table_name, column_name",
  );
  const actual: Record<string, string[]> = {};
  for (const row of result.rows)
    (actual[row.table_name] ??= []).push(row.column_name);
  const expected = Object.fromEntries(
    tables.map((table) => [
      table.name,
      table.columns.map((column) => column.name).sort(),
    ]),
  );
  if (
    JSON.stringify(Object.entries(actual).sort()) !==
    JSON.stringify(Object.entries(expected).sort())
  )
    throw new Error(
      "Database schema differs from the reviewed portability registry; migrate both instances first",
    );
}
export async function lockDatabase(client: PoolClient) {
  const lock = await client.query<{ acquired: boolean }>(
    "select pg_try_advisory_xact_lock(62820062) as acquired",
  );
  if (!lock.rows[0].acquired)
    throw new Error("Another portability operation is running");
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '120s'");
  await client.query(
    `lock table ${tables.map((table) => `public.${quote(table.name)}`).join(", ")} in share row exclusive mode`,
  );
}
/** `select … as row from public.<table> t`: identifiers come from the registry only. */
export function rowProjection(table: (typeof tables)[number]) {
  // JSON numbers cannot faithfully represent bigint/numeric accounting values.
  const precise = table.columns.filter((column) =>
    /^(bigint|numeric)/.test(column.type),
  );
  const overrides = precise.length
    ? ` || jsonb_build_object(${precise.map((column) => `'${column.name}', t.${quote(column.name)}::text`).join(", ")})`
    : "";
  return `select to_jsonb(t)${overrides} as row from public.${quote(table.name)} t`;
}
export async function readDataset(client: PoolClient): Promise<Dataset> {
  await assertDatabaseSchema(client);
  const data = emptyDataset();
  let count = 0,
    size = 0;
  for (const table of tables) {
    const result = await client.query<{ row: Row }>(
      `${rowProjection(table)} limit $1`,
      [MAX_ROWS - count + 1],
    );
    count += result.rows.length;
    if (count > MAX_ROWS)
      throw new Error(
        "Export exceeds the 100,000 row safety limit; nothing was truncated",
      );
    data[table.name] = result.rows.map(({ row }) => row);
    size += Buffer.byteLength(JSON.stringify(data[table.name]));
    if (size > MAX_ARCHIVE_BYTES / 2)
      throw new Error("Database export exceeds the archive safety limit");
  }
  return data;
}

/** Nullable FK edges are restored in a second pass; constraints remain enabled throughout. */
export async function insertDataset(client: PoolClient, data: Dataset) {
  // Migrations contain composite/self FKs not declared in Drizzle. Use the live catalog
  // for insertion order, never an archive-supplied constraint definition.
  const constraints = await client.query<{
    source: string;
    target: string;
    columns: string[];
    deferred: boolean;
  }>(`
    select s.relname as source, t.relname as target, c.condeferrable as deferred,
      array(select a.attname from unnest(c.conkey) with ordinality k(n, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.ord)::text[] as columns
    from pg_constraint c join pg_class s on s.oid = c.conrelid
    join pg_class t on t.oid = c.confrelid join pg_namespace n on n.oid = s.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
  `);
  await client.query("set constraints all deferred");
  const pending = tables.map((table) => ({
    ...table,
    references: constraints.rows
      .filter(
        (constraint) =>
          constraint.source === table.name && !constraint.deferred,
      )
      .map((constraint) => ({
        columns: constraint.columns,
        table: constraint.target,
      })),
  }));
  const inserted = new Set<string>();
  const deferred: {
    table: Omit<(typeof tables)[number], "references">;
    row: Row;
    columns: string[];
  }[] = [];
  while (pending.length) {
    // Null-then-update only breaks real cycles: a row inserted early with a null
    // reference can violate a CHECK such as scheduled_tasks_one_target.
    const ready = pending.findIndex((table) =>
      table.references.every(
        (reference) =>
          inserted.has(reference.table) || reference.table === table.name,
      ),
    );
    const index =
      ready >= 0
        ? ready
        : pending.findIndex((table) =>
            table.references.every(
              (reference) =>
                inserted.has(reference.table) ||
                reference.columns.every(
                  (name) =>
                    table.columns.find((column) => column.name === name)
                      ?.nullable,
                ),
            ),
          );
    if (index < 0) throw new Error("Unsupported required foreign-key cycle");
    const [table] = pending.splice(index, 1);
    for (const row of data[table.name]) {
      const delayed = [
        ...new Set(
          table.references
            .filter((reference) => !inserted.has(reference.table))
            .flatMap((reference) => reference.columns),
        ),
      ];
      const initial = { ...row };
      for (const column of delayed) initial[column] = null;
      const columns = sql.join(
        table.columns.map((column) => sql.identifier(column.name)),
        sql`, `,
      );
      const target = sql`public.${sql.identifier(table.name)}`;
      await query(
        client,
        sql`insert into ${target} (${columns}) select ${columns} from jsonb_populate_record(null::${target}, ${JSON.stringify(initial)}::jsonb)`,
      );
      if (delayed.length) deferred.push({ table, row, columns: delayed });
    }
    inserted.add(table.name);
  }
  for (const { table, row, columns } of deferred) {
    if (!table.primary.length)
      throw new Error(`Missing primary key for ${table.name}`);
    const target = sql`public.${sql.identifier(table.name)}`;
    const assignments = sql.join(
      columns.map(
        (column) =>
          sql`${sql.identifier(column)} = r.${sql.identifier(column)}`,
      ),
      sql`, `,
    );
    const identity = sql.join(
      table.primary.map(
        (column) =>
          sql`t.${sql.identifier(column)} = r.${sql.identifier(column)}`,
      ),
      sql` and `,
    );
    await query(
      client,
      sql`update ${target} t set ${assignments} from jsonb_populate_record(null::${target}, ${JSON.stringify(row)}::jsonb) r where ${identity}`,
    );
  }
  await client.query("set constraints all immediate");
}
