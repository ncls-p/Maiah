import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import { checkWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import { getUserGitHubStatus } from "@/modules/github/publishing";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(req: NextRequest) {
  return handleRoute(req, async ({ session }) => {
    const parsed = querySchema.safeParse({
      workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const permission = await checkWorkspacePermissionForRequest(
      session.user.id,
      parsed.data.workspaceId,
      "agents.chat",
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }
    const status = await getUserGitHubStatus({
      userId: session.user.id,
      workspaceId: parsed.data.workspaceId,
      origin: req.nextUrl.origin,
    });
    return NextResponse.json({ repositories: status.repositories });
  });
}
