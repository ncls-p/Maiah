import {
  authorization,
  matchesPermission,
} from "@/server/domain/services/authorization";
import { API_KEY_SCOPE_CATALOG } from "@/modules/api-keys/scopes";
import {
  hasWorkspacePermissionForRequest,
  isPermissionAllowedByRequestScope,
} from "@/modules/auth/workspace-access";

const WORKSPACE_SCOPE = "workspace";

export type ApiKeyAccessScope = "all" | "own";

export async function getApiKeyAccessScope(
  userId: string,
  workspaceId: string,
): Promise<ApiKeyAccessScope | null> {
  const [canManageAll, canManageOwn] = await Promise.all([
    hasWorkspacePermissionForRequest(userId, workspaceId, "apiKeys.manage"),
    hasWorkspacePermissionForRequest(userId, workspaceId, "apiKeys.manageOwn"),
  ]);

  if (canManageAll) return "all";
  if (canManageOwn) return "own";
  return null;
}

export async function getAvailableApiKeyScopes(
  userId: string,
  workspaceId: string,
) {
  const permissions = await authorization.listPermissions(
    { principalType: "user", principalId: userId },
    WORKSPACE_SCOPE,
    workspaceId,
  );

  return API_KEY_SCOPE_CATALOG.filter(
    ({ permission }) =>
      permissions.some((granted) => matchesPermission(granted, permission)) &&
      isPermissionAllowedByRequestScope(workspaceId, permission),
  );
}
