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
import { reuseImportedIdentities } from "./identities";

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
// Built-in roles are created lazily by whichever user first needs them: the creator
// differs on every instance and is not part of the permission definition.
const roleMetadata = ["id", "created_at", "updated_at", "created_by_user_id"];
function roleDefinition(row: Row) {
  return stable(
    Object.fromEntries(
      Object.entries(row).filter(([key]) => !roleMetadata.includes(key)),
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

export const INSTANCE_TARGET_REQUIRED =
  "Instance archives restore only onto a freshly migrated database that was never started; use the data:portability CLI. Organization archives can be imported here.";
export const ORGANIZATION_ALREADY_IMPORTED =
  "This organization already exists on the destination (already imported); it is never replaced or merged";
async function destinationUsed(client: PoolClient) {
  const used = await client.query<{ used: boolean }>(
    `select (${[
      `exists (select 1 from public.roles where is_system is not true or created_by_user_id is not null)`,
      ...tables
        .filter((table) => !["app_settings", "roles"].includes(table.name))
        .map((table) => `exists (select 1 from public.${quote(table.name)})`),
    ].join(" or ")}) as used`,
  );
  return used.rows[0].used;
}

/** Targeted checks only: the destination may be far larger than any archive. */
export async function prepareTarget(
  client: PoolClient,
  data: Dataset,
  scope: Scope,
) {
  if (scope.type === "instance") {
    // A started instance always holds its bootstrap administrator and default
    // organization: a complete restore would collide with them.
    if (await destinationUsed(client))
      throw new Error(INSTANCE_TARGET_REQUIRED);
    // A freshly migrated DB contains generated system roles/settings. No user data is removed.
    await client.query("delete from public.roles");
    await client.query("delete from public.app_settings");
    return;
  }
  const admin = await client.query(
    `select 1 from public."user" where role = 'admin' and banned is not true limit 1`,
  );
  if (!admin.rowCount)
    throw new Error(
      "Initialize a destination platform administrator before importing an organization",
    );
  const present = await client.query(
    `select 1 from public.organizations where id = $1::uuid`,
    [scope.organizationId],
  );
  if (present.rowCount) throw new Error(ORGANIZATION_ALREADY_IMPORTED);
  await reuseImportedIdentities(client, data);
  const emails = data.user
    .map((user) => user.email)
    .filter((email): email is string => typeof email === "string")
    .map((email) => email.toLowerCase());
  if (emails.length) {
    const existing = await client.query<{ email: string }>(
      `select lower(email) as email from public."user" where lower(email) = any($1::text[]) order by 1 limit 6`,
      [emails],
    );
    if (existing.rowCount) {
      const listed = existing.rows.slice(0, 5).map((row) => row.email);
      const more = existing.rows.length > 5 ? ", …" : "";
      throw new Error(
        `An archived user already exists on the destination with the same email (${listed.join(", ")}${more}); identities are never merged`,
      );
    }
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
        "Built-in role definitions differ; run the same Maiah version on both instances instead of merging permissions",
      );
    mapping.set(String(role.id), String(target.id));
    return false;
  });
  for (const binding of data.role_bindings)
    binding.role_id = mapping.get(String(binding.role_id)) ?? binding.role_id;
  for (const invitation of data.workspace_invitations)
    invitation.role_ids_json = remapRoleList(invitation.role_ids_json, mapping);
}
