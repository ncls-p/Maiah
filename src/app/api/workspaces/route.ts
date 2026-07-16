import { NextRequest, NextResponse } from "next/server";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  ensurePrimaryWorkspaceForUser,
  getWorkspacesByUserId,
} from "@/modules/workspace/use-cases";

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session, auth }) => {
      const workspaces = await getWorkspacesByUserId(session.user.id);
      if (auth.type === "api_key") {
        const forbidden = await requireWorkspacePermissionAsync(
          session.user.id,
          auth.workspaceId,
          "workspaces.get",
        );
        if (forbidden) return forbidden;
        return NextResponse.json(
          workspaces.filter(
            ({ workspace }) => workspace.id === auth.workspaceId,
          ),
        );
      }
      return NextResponse.json(workspaces);
    },
    { logLabel: "Failed to list workspaces" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session, auth }) => {
      if (auth.type === "api_key") {
        const forbidden = await requireWorkspacePermissionAsync(
          session.user.id,
          auth.workspaceId,
          "workspaces.get",
        );
        if (forbidden) return forbidden;
        const workspaces = await getWorkspacesByUserId(session.user.id);
        const selected = workspaces.find(
          ({ workspace }) => workspace.id === auth.workspaceId,
        );
        if (!selected) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.json(selected.workspace);
      }
      const workspace = await ensurePrimaryWorkspaceForUser({
        userId: session.user.id,
        role: session.user.role,
      });
      return NextResponse.json(workspace);
    },
    { logLabel: "Failed to resolve primary workspace" },
  );
}
