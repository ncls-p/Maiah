import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { configureOAuth, oauthStatus } from "@/modules/mcp/oauth/config";
import { beginOAuth } from "@/modules/mcp/oauth/flow";
import { disconnectOAuth } from "@/modules/mcp/oauth/tokens";
import { audit } from "@/server/domain/services/audit";
type Context = { params: Promise<{ serverId: string }> };
async function route(req: NextRequest, context: Context, method: string) {
  return handleRoute(
    req,
    async ({ session }) => {
      const workspaceId = z
        .uuid()
        .parse(req.nextUrl.searchParams.get("workspaceId"));
      const serverId = z.uuid().parse((await context.params).serverId);
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        method === "PUT" ? "mcpServers.manage" : "mcpServers.get",
        "mcp_server",
        serverId,
      );
      if (forbidden) return forbidden;
      let result: unknown;
      if (method === "GET")
        result = await oauthStatus(serverId, workspaceId, session.user.id);
      else if (method === "PUT")
        result = await configureOAuth(
          serverId,
          workspaceId,
          session.user.id,
          await req.json(),
          await canManageTenantGlobals(session, workspaceId),
        );
      else if (method === "POST")
        result = await beginOAuth(serverId, workspaceId, session.user.id);
      else
        result = await disconnectOAuth(serverId, workspaceId, session.user.id);
      if (method !== "GET")
        await audit.emit({
          workspaceId,
          actorPrincipalType: "user",
          actorPrincipalId: session.user.id,
          action: `mcpServer.oauth.${method === "PUT" ? "configured" : method === "POST" ? "started" : "disconnected"}`,
          resourceType: "mcp_server",
          resourceId: serverId,
          outcome: "success",
        });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    },
    {
      allowApiKey: false,
      logLabel: "MCP OAuth action failed",
      expectedError: (error) =>
        NextResponse.json(
          {
            error:
              error instanceof Error && /^MCP_[A-Z_]+$/.test(error.message)
                ? error.message
                : "MCP_OAUTH_ACTION_FAILED",
          },
          { status: 400 },
        ),
    },
  );
}
export const GET = (req: NextRequest, context: Context) =>
  route(req, context, "GET");
export const PUT = (req: NextRequest, context: Context) =>
  route(req, context, "PUT");
export const POST = (req: NextRequest, context: Context) =>
  route(req, context, "POST");
export const DELETE = (req: NextRequest, context: Context) =>
  route(req, context, "DELETE");
