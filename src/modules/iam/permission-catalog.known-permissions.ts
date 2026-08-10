import { PERMISSION_CATALOG } from "./permission-catalog.permission-catalog-group";

export const KNOWN_PERMISSIONS = new Set<string>(
  PERMISSION_CATALOG.flatMap((group) =>
    group.permissions.map((permission) => permission.id),
  ),
);

export function isKnownPermission(permission: string) {
  return KNOWN_PERMISSIONS.has(permission);
}

function permissionGrantMatches(grant: string, permission: string) {
  if (grant === "*" || grant === permission) return true;
  if (!grant.endsWith(".*")) return false;
  return permission.startsWith(grant.slice(0, -1));
}

export function expandPermissionGrants(grants: readonly string[]) {
  return [...KNOWN_PERMISSIONS].filter((permission) =>
    grants.some((grant) => permissionGrantMatches(grant, permission)),
  );
}

const ORGANIZATION_ONLY_PERMISSIONS = new Set([
  "organization.get",
  "organization.update",
  "workspaces.create",
  "members.manage",
  "teams.manage",
]);

export function isPermissionCompatibleWithScope(
  permission: string,
  scopeType: "organization" | "workspace",
) {
  return (
    scopeType === "organization" ||
    !ORGANIZATION_ONLY_PERMISSIONS.has(permission)
  );
}
