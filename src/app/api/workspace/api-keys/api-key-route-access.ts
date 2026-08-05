import { requireWorkspaceMemberAsync } from "@/lib/route-handler";
import { getApiKeyAccessScope } from "@/modules/api-keys/permissions";
import { NextResponse } from "next/server";

export async function getApiKeyRouteAccess(userId: string, workspaceId: string) {
  const forbidden = await requireWorkspaceMemberAsync(userId, workspaceId);
  if (forbidden) return { ok: false, response: forbidden } as const;
  const accessScope = await getApiKeyAccessScope(userId, workspaceId);
  if (!accessScope) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden", reason: "Missing permission: apiKeys.manageOwn" }, { status: 403 }),
    } as const;
  }
  return { ok: true, accessScope } as const;
}
