import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireRequestPermissionScopeAsync,
  requireWorkspaceMemberAsync,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  createMcpServerWithDiscovery,
  listMcpServers,
  toSafeMcpServer,
} from "@/modules/mcp/use-cases";
import { withResourceProvenance } from "@/modules/iam/resource-provenance";

const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255),
  transport: z.enum(["stdio", "sse", "streamable-http"]),
  command: z.string().max(2048).optional(),
  args: z.array(z.string().max(512)).optional(),
  url: z.url().optional(),
  requireApproval: z.boolean().optional(),
  isGlobal: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export async function GET(req: NextRequest) {
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
      const scopeForbidden = await requireRequestPermissionScopeAsync(
        session.user.id,
        parsed.data.workspaceId,
        "mcpServers.get",
      );
      if (scopeForbidden) return scopeForbidden;
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (forbidden) return forbidden;
      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      const servers = await listMcpServers(
        parsed.data.workspaceId,
        session.user.id,
        canManageGlobal,
      );
      return NextResponse.json(
        await withResourceProvenance(
          servers,
          parsed.data.workspaceId,
          session.user.id,
        ),
      );
    },
    { logLabel: "Failed to list MCP servers" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = createSchema.safeParse(await req.json());
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
      const { server, discovery } = await createMcpServerWithDiscovery(
        {
          ...parsed.data,
          isGlobal: parsed.data.isGlobal && canManageGlobal,
          userId: session.user.id,
        },
        canManageGlobal,
      );
      const [serverWithProvenance] = await withResourceProvenance(
        [{ ...toSafeMcpServer(server), canEdit: true, discovery }],
        parsed.data.workspaceId,
        session.user.id,
      );
      return NextResponse.json(serverWithProvenance, { status: 201 });
    },
    { logLabel: "Failed to create MCP server" },
  );
}
