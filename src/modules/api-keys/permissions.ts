import { authorization } from "@/server/domain/services/authorization";

const WORKSPACE_SCOPE = "workspace";

export type ApiKeyAccessScope = "all" | "own";

export async function getApiKeyAccessScope(
  userId: string,
  workspaceId: string,
): Promise<ApiKeyAccessScope | null> {
  const ctx = {
    principalType: "user" as const,
    principalId: userId,
  };

  const [canManageAll, canManageOwn] = await Promise.all([
    authorization.hasPermission(
      ctx,
      "apiKeys.manage",
      WORKSPACE_SCOPE,
      workspaceId,
    ),
    authorization.hasPermission(
      ctx,
      "apiKeys.manageOwn",
      WORKSPACE_SCOPE,
      workspaceId,
    ),
  ]);

  if (canManageAll) return "all";
  if (canManageOwn) return "own";
  return null;
}
