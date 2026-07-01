import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  archiveMcpServer,
  getMcpServer,
  toMcpServerForEdit,
  toSafeMcpServer,
  updateMcpServer,
} from "@/modules/mcp/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });
const updateSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255).optional(),
  transport: z.enum(["stdio", "sse", "streamable-http"]).optional(),
  url: z.url().or(z.literal("")).optional(),
  command: z.string().max(2048).optional(),
  args: z.array(z.string().max(512)).optional(),
  enabled: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  isGlobal: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success)
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "mcpServers.get",
      );
      if (forbidden) return forbidden;
      const { serverId } = await params;
      const server = await getMcpServer(
        serverId,
        parsed.data.workspaceId,
        session.user.id,
      );
      if (!server)
        return NextResponse.json(
          { error: "MCP server not found" },
          { status: 404 },
        );
      return NextResponse.json(toMcpServerForEdit(server));
    },
    { logLabel: "Failed to get MCP server" },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = updateSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
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
      if (parsed.data.isGlobal && !canManageGlobal) {
        return NextResponse.json(
          { error: "Only admins can make MCP servers global" },
          { status: 403 },
        );
      }
      const server = await updateMcpServer({
        serverId,
        userId: session.user.id,
        canManageGlobal,
        ...parsed.data,
        isGlobal: parsed.data.isGlobal,
      });
      return NextResponse.json(toSafeMcpServer(server));
    },
    {
      logLabel: "Failed to update MCP server",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status =
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success)
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
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
      await archiveMcpServer(
        serverId,
        parsed.data.workspaceId,
        session.user.id,
        canManageGlobal,
      );
      return NextResponse.json({ ok: true });
    },
    {
      logLabel: "Failed to archive MCP server",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status =
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}
