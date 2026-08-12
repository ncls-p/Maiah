import {
  handleRoute,
  requireWorkspaceMemberAsync,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  ensurePrimaryWorkspaceForUser,
  getActiveWorkspaceIdForUser,
  getWorkspacesByUserId,
  setActiveWorkspaceForUser,
} from "@/modules/workspace/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const activeWorkspaceSchema = z.object({ workspaceId: z.uuid() });

type WorkspaceRow = Awaited<ReturnType<typeof getWorkspacesByUserId>>[number];

function markActiveWorkspace(
  rows: WorkspaceRow[],
  activeWorkspaceId: string | null,
) {
  return rows.map((row) => ({
    ...row,
    isActive: row.workspace.id === activeWorkspaceId,
  }));
}

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
          markActiveWorkspace(
            workspaces.filter(
              ({ workspace }) => workspace.id === auth.workspaceId,
            ),
            auth.workspaceId,
          ),
        );
      }
      const activeWorkspaceId = await getActiveWorkspaceIdForUser(
        session.user.id,
      );
      return NextResponse.json(
        markActiveWorkspace(workspaces, activeWorkspaceId),
      );
    },
    { logLabel: "Failed to list workspaces" },
  );
}

export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session, auth }) => {
      if (auth.type === "api_key") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const parsed = activeWorkspaceSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
      }

      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (forbidden) return forbidden;

      await setActiveWorkspaceForUser(
        session.user.id,
        parsed.data.workspaceId,
      );
      return new NextResponse(null, { status: 204 });
    },
    { logLabel: "Failed to save active workspace" },
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
