import { checkWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import { getUserGitHubStatus } from "@/modules/github/publishing";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function getAuthorizedGitHubStatus(
  req: NextRequest,
  userId: string,
) {
  const parsed = querySchema.safeParse({
    workspaceId: req.nextUrl.searchParams.get("workspaceId"),
  });
  if (!parsed.success)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid request" },
        { status: 400 },
      ),
    } as const;
  const permission = await checkWorkspacePermissionForRequest(
    userId,
    parsed.data.workspaceId,
    "agents.chat",
  );
  if (!permission.granted)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      ),
    } as const;
  const status = await getUserGitHubStatus({
    userId,
    workspaceId: parsed.data.workspaceId,
    origin: req.nextUrl.origin,
  });
  return { ok: true, status } as const;
}
