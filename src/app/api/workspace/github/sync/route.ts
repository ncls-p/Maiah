import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { handleRoute } from "@/lib/route-handler";
import { checkWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import {
  getUserGitHubStatus,
  syncUserGitHubInstallations,
} from "@/modules/github/publishing";

const syncSchema = z.object({
  workspaceId: z.uuid(),
  connectionId: z.uuid().optional(),
});

export async function POST(req: NextRequest) {
  return handleRoute(req, async ({ session, requestId }) => {
    try {
      const parsed = syncSchema.safeParse(await req.json().catch(() => null));
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

      await syncUserGitHubInstallations({
        userId: session.user.id,
        connectionId: parsed.data.connectionId,
      });
      const status = await getUserGitHubStatus({
        userId: session.user.id,
        workspaceId: parsed.data.workspaceId,
        origin: req.nextUrl.origin,
      });

      return NextResponse.json({ ...status, synced: true });
    } catch (error) {
      logHandledError(
        "GitHub repository sync failed",
        { requestId, userId: session.user.id },
        error as Error,
      );
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to sync GitHub repositories",
        },
        { status: 400 },
      );
    }
  });
}
