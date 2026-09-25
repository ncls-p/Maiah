import type { PoolClient } from "pg";
import { MAX_ARCHIVE_BYTES, MAX_ROWS } from "./archive";
import {
  emptyDataset,
  quote,
  tables,
  type Dataset,
  type Row,
  type TableName,
} from "./registry";
import {
  ownedBy,
  resourceTables,
  selectOrganization,
  visitReferences,
} from "./scope";
import { rowProjection } from "./postgres";

/** Rows whose `column` equals one of `values`, starts with a prefix or ends with `suffix`. */
export interface RowFilter {
  column: string;
  values?: string[];
  prefixes?: string[];
  suffix?: string;
  equals?: { column: string; value: string };
}
export interface RowSource {
  rows(table: TableName, filter: RowFilter): Promise<Row[]>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const like = (value: string) =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

/** Parameterized reads; identifiers come from the reviewed registry only. */
export function postgresRowSource(client: PoolClient): RowSource {
  return {
    async rows(name, filter) {
      const table = tables.find((candidate) => candidate.name === name)!;
      const type = (column: string) =>
        table.columns.find((candidate) => candidate.name === column)?.type;
      const params: unknown[] = [];
      const parameter = (value: unknown) => `$${params.push(value)}`;
      const column = `t.${quote(filter.column)}`;
      const conditions: string[] = [];
      if (filter.values?.length) {
        const columnType = type(filter.column);
        if (columnType === "uuid") {
          const ids = filter.values.filter((value) => uuid.test(value));
          if (ids.length)
            conditions.push(`${column} = any(${parameter(ids)}::uuid[])`);
        } else if (/^(text|varchar)/.test(columnType ?? ""))
          conditions.push(
            `${column} = any(${parameter(filter.values)}::text[])`,
          );
        else
          conditions.push(
            `${column}::text = any(${parameter(filter.values)}::text[])`,
          );
      }
      if (filter.prefixes?.length)
        conditions.push(
          `${column}::text like any(${parameter(filter.prefixes.map((prefix) => `${like(prefix)}%`))}::text[])`,
        );
      if (filter.suffix)
        conditions.push(
          `${column}::text like ${parameter(`%${like(filter.suffix)}`)}`,
        );
      if (!conditions.length) return [];
      const equals = filter.equals
        ? ` and t.${quote(filter.equals.column)}::text = ${parameter(filter.equals.value)}`
        : "";
      const result = await client.query<{ row: Row }>(
        `${rowProjection(table)} where (${conditions.join(" or ")})${equals}`,
        params,
      );
      return result.rows.map(({ row }) => row);
    },
  };
}
/** Reference implementation over an in-memory dataset (tests and parity checks). */
export function memoryRowSource(data: Dataset): RowSource {
  return {
    async rows(name, filter) {
      return data[name].filter((row) => {
        if (
          filter.equals &&
          String(row[filter.equals.column]) !== filter.equals.value
        )
          return false;
        const value = row[filter.column];
        if (value == null) return false;
        const text = String(value);
        return (
          !!filter.values?.some(
            (candidate) => candidate.toLowerCase() === text.toLowerCase(),
          ) ||
          !!filter.prefixes?.some((prefix) => text.startsWith(prefix)) ||
          (filter.suffix !== undefined && text.endsWith(filter.suffix))
        );
      });
    },
  };
}

/**
 * Reads a superset of every row the organization traversal can reach, then runs the very
 * same `selectOrganization` on it. Unrelated rows are never loaded, so the archive limits
 * apply to the organization scope; the traversal and its refusals stay identical.
 */
export async function readOrganizationSource(
  source: RowSource,
  organizationId: string,
): Promise<Dataset> {
  const data = emptyDataset();
  const seen = new Map(tables.map((table) => [table.name, new Set<string>()]));
  const asked = new Set<string>();
  let rows = 0,
    size = 0,
    added = 0;
  const key = (name: TableName, row: Row) => {
    const table = tables.find((candidate) => candidate.name === name)!;
    return JSON.stringify(
      (table.primary.length ? table.primary : Object.keys(row)).map(
        (column) => row[column],
      ),
    );
  };
  async function fetch(name: TableName, filter: RowFilter) {
    const values = (filter.values ?? []).filter((value) => {
      const signature = JSON.stringify([
        name,
        filter.column,
        filter.equals,
        value,
      ]);
      if (asked.has(signature)) return false;
      asked.add(signature);
      return true;
    });
    if (!values.length && !filter.prefixes?.length && !filter.suffix) return;
    for (const row of await source.rows(name, { ...filter, values })) {
      const identity = key(name, row);
      if (seen.get(name)!.has(identity)) continue;
      seen.get(name)!.add(identity);
      data[name].push(row);
      added++;
      // Traversal working set, bounded independently from the exported scope.
      if (++rows > MAX_ROWS * 2)
        throw new Error(
          "Export exceeds the 100,000 row safety limit; nothing was truncated",
        );
      size += Buffer.byteLength(JSON.stringify(row));
      if (size > MAX_ARCHIVE_BYTES)
        throw new Error("Database export exceeds the archive safety limit");
    }
  }
  const ids = (name: TableName) =>
    data[name]
      .map((row) => row.id)
      .filter((id) => id != null)
      .map(String);
  const strings = (values: unknown[]) => [
    ...new Set(values.filter((value) => value != null).map(String)),
  ];

  await fetch("organizations", { column: "id", values: [organizationId] });
  await fetch("workspaces", {
    column: "organization_id",
    values: [organizationId],
  });
  const workspaceIds = data.workspaces
    .filter((row) => row.organization_id === organizationId)
    .map((row) => String(row.id));
  for (const table of tables) {
    const columns = table.columns.map((column) => column.name);
    if (columns.includes("organization_id"))
      await fetch(table.name, {
        column: "organization_id",
        values: [organizationId],
      });
    if (columns.includes("workspace_id"))
      await fetch(table.name, { column: "workspace_id", values: workspaceIds });
  }
  await fetch("marketplace_items", {
    column: "publisher_workspace_id",
    values: workspaceIds,
  });
  await fetch("app_settings", {
    column: "key",
    values: [`microsoft-sso:${organizationId}`],
    suffix: `:organization:${organizationId}`,
  });
  await fetch("roles", {
    column: "owner_resource_id",
    values: [organizationId, ...workspaceIds],
  });

  do {
    added = 0;
    for (const [name, [column, owner]] of Object.entries(ownedBy) as [
      TableName,
      [string, TableName],
    ][])
      await fetch(name, { column, values: ids(owner) });
    await fetch("app_settings", {
      column: "key",
      values: [
        ...ids("agent_versions").map((id) => `generation:${id}`),
        ...ids("user").map((id) => `onboarding.complete:${id}`),
      ],
    });
    // `generation:<id>:…` also matches the traversal's key.split(":")[1] rule.
    const prefixes = [
      ...ids("agent_versions").map((id) => `generation:${id}:`),
      ...ids("user").map((id) => `onboarding.complete:${id}:`),
    ].filter((prefix) => {
      const signature = JSON.stringify(["app_settings", "key-prefix", prefix]);
      if (asked.has(signature)) return false;
      asked.add(signature);
      return true;
    });
    if (prefixes.length)
      await fetch("app_settings", { column: "key", prefixes });
    for (const [type, table] of Object.entries(resourceTables)) {
      await fetch("role_bindings", {
        column: "resource_id",
        values: ids(table),
        equals: { column: "resource_type", value: type },
      });
      await fetch("usage_limits", {
        column: "subject_id",
        values: ids(table),
        equals: { column: "subject_type", value: type },
      });
    }
    const wanted = new Map<string, unknown[]>();
    const want = (name: TableName, column: string, value: unknown) => {
      const signature = `${name}\u0000${column}`;
      if (!wanted.has(signature)) wanted.set(signature, []);
      wanted.get(signature)!.push(value);
    };
    for (const table of tables)
      for (const row of data[table.name]) {
        for (const reference of table.references)
          reference.columns.forEach((column, index) =>
            want(reference.table, reference.foreignColumns[index], row[column]),
          );
        visitReferences(table.name, row, (parent, id) => {
          if (typeof id === "string") want(parent, "id", id);
        });
      }
    for (const [signature, values] of wanted) {
      const [name, column] = signature.split("\u0000") as [TableName, string];
      await fetch(name, { column, values: strings(values) });
    }
  } while (added);
  return data;
}

/** Organization rows read with targeted queries; limits apply to the selected scope only. */
export async function readOrganization(
  source: RowSource,
  organizationId: string,
): Promise<Dataset> {
  const selected = selectOrganization(
    await readOrganizationSource(source, organizationId),
    organizationId,
  );
  let rows = 0,
    size = 0;
  for (const name of Object.keys(selected) as TableName[]) {
    rows += selected[name].length;
    size += Buffer.byteLength(JSON.stringify(selected[name]));
  }
  if (rows > MAX_ROWS)
    throw new Error(
      "Export exceeds the 100,000 row safety limit; nothing was truncated",
    );
  if (size > MAX_ARCHIVE_BYTES / 2)
    throw new Error("Database export exceeds the archive safety limit");
  return selected;
}
