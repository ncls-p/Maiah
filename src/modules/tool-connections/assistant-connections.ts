import { db } from "@/server/infrastructure/db";
import { mcpTools } from "@/server/infrastructure/db/schema";
import { inArray } from "drizzle-orm";
import { selectExecutionConnections } from "./connection-selection";
import {
  findPreferredConnection,
  listToolExecutionConnections,
} from "./use-cases.build-signed-tool-context-headers";
import {
  findConnectorForTool,
  findUserToolSettings,
} from "./use-cases.upsert-tool-connection-requirement";
import type { ResolveToolExecutionHeadersInput } from "./use-cases.mcp-tool-source";

export async function getAssistantConnections(
  input: ResolveToolExecutionHeadersInput,
  allowedIds?: string[] | null,
  conversationIds?: string[],
) {
  const { connector } = await findConnectorForTool(input);
  if (connector?.key !== "servicenow") return allowedIds != null ? [] : null;
  const available = await listToolExecutionConnections(input);
  // Existing assistants retain their single user-default connection until configured.
  const preferred =
    allowedIds == null
      ? await findPreferredConnection(
          connector.id,
          input,
          await findUserToolSettings(input),
        )
      : null;
  return selectExecutionConnections(
    available,
    allowedIds ?? (preferred ? [preferred.id] : []),
    conversationIds,
  );
}

/** Conversation-added tools inherit any explicit restrictions on their MCP server. */
export async function getServerConnectionRestrictions(
  bindings: Array<{
    toolSource: string;
    toolId: string;
    connectionIds?: string[] | null;
  }>,
) {
  const configured = bindings.filter(
    (binding) => binding.toolSource === "mcp" && binding.connectionIds != null,
  );
  const restrictions = new Map<string, string[]>();
  if (!configured.length) return restrictions;
  const rows = await db
    .select({ id: mcpTools.id, serverId: mcpTools.mcpServerId })
    .from(mcpTools)
    .where(
      inArray(
        mcpTools.id,
        configured.map((binding) => binding.toolId),
      ),
    );
  for (const row of rows) {
    const ids = configured.find(
      (binding) => binding.toolId === row.id,
    )!.connectionIds!;
    restrictions.set(row.serverId, [
      ...new Set([...(restrictions.get(row.serverId) ?? []), ...ids]),
    ]);
  }
  return restrictions;
}
