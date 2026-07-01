import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { testMcpConnection } from "@/modules/mcp/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "mcpServers.manage",
      );
      if (forbidden) return forbidden;
      const { serverId } = await params;
      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      const result = await testMcpConnection(
        serverId,
        parsed.data.workspaceId,
        session.user.id,
        canManageGlobal,
      );
      return NextResponse.json(result);
    },
    {
      logLabel: "Failed to test MCP server",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: msg }, { status: 400 });
      },
    },
  );
}
