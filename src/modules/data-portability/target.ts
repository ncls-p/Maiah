import type { PoolClient } from "pg";
import { z } from "zod";
import {
  quote,
  tables,
  type Dataset,
  type Row,
  type TableName,
} from "./registry";
import type { Scope } from "./archive";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function roleDefinition(row: Row) {
  return stable(
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) => !["id", "created_at", "updated_at"].includes(key),
      ),
    ),
  );
}
function remapRoleList(
  value: unknown,
  mapping: Map<string, string>,
): string[] | null {
  const roles = z.array(z.uuid()).nullable().parse(value);
  return roles?.map((id) => mapping.get(id) ?? id) ?? null;
}

/**
 * Identifiers carried without their row may be dangling source history, but must never
 * designate existing destination data (for example a share of another tenant's agent).
 */
export async function assertReferencesAbsent(
  client: PoolClient,
  references: Map<TableName, Set<string>>,
) {
  for (const [name, ids] of references) {
    const table = tables.find((candidate) => candidate.name === name);
    const id = table?.columns.find((column) => column.name === "id");
    if (!table || !id) continue;
    const typed = id.type === "uuid";
    const values = [...ids].filter((value) => !typed || uuid.test(value));
    if (!values.length) continue;
    const result = await client.query(
      `select 1 from public.${quote(name)} where id = any($1::${typed ? "uuid" : "text"}[]) limit 1`,
      [values],
    );
    if (result.rowCount)
      throw new Error(
        "Archive references existing destination data it does not contain; import refused",
      );
  }
}

/** Targeted checks only: the destination may be far larger than any archive. */
export async function prepareTarget(
  client: PoolClient,
  data: Dataset,
  scope: Scope,
) {
  if (scope.type === "organization") {
    const admin = await client.query(
      `select 1 from public."user" where role = 'admin' and banned is not true limit 1`,
    );
    if (!admin.rowCount)
      throw new Error(
        "Initialize a destination platform administrator before importing an organization",
      );
  }
  const emails = data.user
    .map((user) => user.email)
    .filter((email): email is string => typeof email === "string")
    .map((email) => email.toLowerCase());
  if (emails.length) {
    const existing = await client.query(
      `select 1 from public."user" where lower(email) = any($1::text[]) limit 1`,
      [emails],
    );
    if (existing.rowCount)
      throw new Error(
        "An archived user already exists on the destination with the same email; identities are never merged",
      );
  }
  const used = await client.query<{ used: boolean }>(
    `select (${[
      `exists (select 1 from public.roles where is_system is not true or created_by_user_id is not null)`,
      ...tables
        .filter((table) => !["app_settings", "roles"].includes(table.name))
        .map((table) => `exists (select 1 from public.${quote(table.name)})`),
    ].join(" or ")}) as used`,
  );
  if (scope.type === "instance" && !used.rows[0].used) {
    // A freshly migrated DB contains generated system roles/settings. No user data is removed.
    await client.query("delete from public.roles");
    await client.query("delete from public.app_settings");
    return;
  }
  const systemRoles = (
    await client.query<{ row: Row }>(
      "select to_jsonb(r) as row from public.roles r where r.is_system",
    )
  ).rows.map(({ row }) => row);
  const mapping = new Map<string, string>();
  data.roles = data.roles.filter((role) => {
    if (!role.is_system) return true;
    const target = systemRoles.find(
      (candidate) =>
        candidate.name === role.name &&
        candidate.scope_type === role.scope_type,
    );
    if (!target) return true;
    if (roleDefinition(role) !== roleDefinition(target))
      throw new Error(
        "Built-in role definitions differ; use a clean instance target instead of merging permissions",
      );
    mapping.set(String(role.id), String(target.id));
    return false;
  });
  for (const binding of data.role_bindings)
    binding.role_id = mapping.get(String(binding.role_id)) ?? binding.role_id;
  for (const invitation of data.workspace_invitations)
    invitation.role_ids_json = remapRoleList(invitation.role_ids_json, mapping);
}
