import type { PoolClient } from "pg";
import { z } from "zod";
import type { Dataset, Row } from "./registry";
import type { Scope } from "./archive";
import { readDataset } from "./postgres";

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
export async function prepareTarget(
  client: PoolClient,
  data: Dataset,
  scope: Scope,
) {
  const existing = await readDataset(client);
  if (
    scope.type === "organization" &&
    !existing.user.some((user) => user.role === "admin" && user.banned !== true)
  )
    throw new Error(
      "Initialize a destination platform administrator before importing an organization",
    );
  const onlyMigrationDefaults = Object.entries(existing).every(
    ([name, rows]) =>
      name === "app_settings" ||
      (name === "roles"
        ? rows.every(
            (row) => row.is_system === true && row.created_by_user_id == null,
          )
        : rows.length === 0),
  );
  if (scope.type === "instance" && onlyMigrationDefaults) {
    // A freshly migrated DB contains generated system roles/settings. No user data is removed.
    await client.query("delete from public.roles");
    await client.query("delete from public.app_settings");
    return;
  }
  const mapping = new Map<string, string>();
  data.roles = data.roles.filter((role) => {
    if (!role.is_system) return true;
    const target = existing.roles.find(
      (candidate) =>
        candidate.is_system &&
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
