import { logHandledWarning } from "@/lib/logger";
import { callRemoteMcpTool } from "@/modules/mcp/client";
import { getMcpServer } from "@/modules/mcp/use-cases";
import { projectToolPayloadForDisplay } from "@/modules/tool/safe-payload";
import { resolveToolExecutionHeaders } from "@/modules/tool-connections/use-cases";
import { db } from "@/server/infrastructure/db";
import { mcpTools } from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";

function mcpApplicationErrorMessage(
  result: Awaited<ReturnType<typeof callRemoteMcpTool>>,
) {
  const payload = projectToolPayloadForDisplay(
    result.structuredContent ?? result.content,
    {
      maxArrayItems: 10,
      maxDepth: 4,
      maxObjectKeys: 20,
      maxStringLength: 1_000,
    },
  );

  if (Array.isArray(payload)) {
    const text = payload
      .flatMap((item) =>
        item && typeof item === "object" && "text" in item
          ? [String(item.text)]
          : [],
      )
      .filter(Boolean)
      .join("\n");
    if (text) return `MCP tool failed: ${text}`;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["error", "message", "result", "text"] as const) {
      if (key in record && typeof record[key] === "string") {
        return `MCP tool failed: ${record[key]}`;
      }
    }
  }

  if (typeof payload === "string" && payload) {
    return `MCP tool failed: ${payload}`;
  }

  return "MCP tool failed";
}

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

  // MCP application-level failures are valid protocol responses, signalled by
  // `isError`. They must not be persisted or exposed to the model as successes.
  if (result.isError) {
    throw new Error(mcpApplicationErrorMessage(result));
  }

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
