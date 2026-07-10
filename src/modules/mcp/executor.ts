import { logHandledWarning } from "@/lib/logger";
import { callRemoteMcpTool } from "@/modules/mcp/client";
import { getMcpServer } from "@/modules/mcp/use-cases";
import { resolveToolExecutionHeaders } from "@/modules/tool-connections/use-cases";
import { db } from "@/server/infrastructure/db";
import { mcpTools } from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";

export async function executeMcpTool(input: {
  serverId: string;
  toolId: string;
  workspaceId: string;
  toolInput: unknown;
  userId?: string;
}) {
  const server = await getMcpServer(
    input.serverId,
    input.workspaceId,
    input.userId,
  );
  if (!server) throw new Error("MCP server not found");
  if (!server.enabled) throw new Error("MCP server is disabled");
  if (!server.url) throw new Error("MCP server URL is not configured");

  const [tool] = await db
    .select()
    .from(mcpTools)
    .where(
      and(
        eq(mcpTools.id, input.toolId),
        eq(mcpTools.mcpServerId, input.serverId),
        eq(mcpTools.enabled, true),
      ),
    )
    .limit(1);

  if (!tool) throw new Error("MCP tool not found");

  const headers = input.userId
    ? await resolveToolExecutionHeaders({
        workspaceId: input.workspaceId,
        userId: input.userId,
        toolSource: "mcp",
        toolId: input.toolId,
        mcpServerId: input.serverId,
      })
    : {};

  const result = await callRemoteMcpTool(server, tool.name, input.toolInput, {
    headers,
  });

  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  if (result.content !== undefined) {
    return result.content;
  }

  logHandledWarning("MCP tool returned empty result", {
    serverId: input.serverId,
    toolName: tool.name,
  });
  return { ok: true };
}
