import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/lib/route-handler";
import { hasResourcePermissionForRequest } from "@/modules/auth/workspace-access";
import { env } from "@/lib/env";
import { finishOAuth } from "@/modules/mcp/oauth/flow";
import { syncMcpTools } from "@/modules/mcp/use-cases.sync-mcp-tools";
function landing(success: boolean) {
  const url = new URL("/tools?tab=mcp", env.BETTER_AUTH_URL);
  url.searchParams.set("oauth", success ? "connected" : "failed");
  return NextResponse.redirect(url, {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const state = req.nextUrl.searchParams.get("state");
      const code = req.nextUrl.searchParams.get("code") ?? undefined;
      if (!state || state.length > 512 || (code && code.length > 8192))
        return landing(false);
      try {
        const result = await finishOAuth(
          session.user.id,
          state,
          code,
          req.nextUrl.searchParams.get("error") ?? undefined,
        );
        // Only a manager can change the shared catalog. Personal authorization itself
        // is available to every user with access to this server.
        if (
          await hasResourcePermissionForRequest(
            session.user.id,
            result.workspaceId,
            "mcpServers.manage",
            "mcp_server",
            result.serverId,
          )
        ) {
          await syncMcpTools(
            result.serverId,
            result.workspaceId,
            session.user.id,
          ).catch(() => undefined);
        }
        return landing(true);
      } catch {
        return landing(false);
      }
    },
    { allowApiKey: false, logLabel: "MCP OAuth callback failed" },
  );
}
