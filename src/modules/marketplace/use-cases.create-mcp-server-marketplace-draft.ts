import { db } from "@/server/infrastructure/db";
import {
mcpServers,
mcpTools
} from "@/server/infrastructure/db/schema";
import { and,eq } from "drizzle-orm";
import { upsertMarketplaceDraft } from "./draft-helpers";
import {
buildMcpPresetManifest
} from "./manifest-builders";
import { DraftInputExtras } from "./use-cases.get-marketplace-item-detail";
import { MarketplaceVisibility } from "./use-cases.marketplace-visibility";

export async function createMcpServerMarketplaceDraft(
  input: {
    workspaceId: string;
    userId: string;
    mcpServerId: string;
    version: string;
    name?: string;
    description?: string;
    visibility?: MarketplaceVisibility;
  } & DraftInputExtras,
) {
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(
      and(
        eq(mcpServers.id, input.mcpServerId),
        eq(mcpServers.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!server || server.createdById !== input.userId) {
    throw new Error("MCP server not found");
  }

  const tools = await db
    .select()
    .from(mcpTools)
    .where(eq(mcpTools.mcpServerId, server.id));

  const name = input.name || server.name;
  const manifest = buildMcpPresetManifest(
    name,
    input.description,
    server,
    tools,
    "server",
  );

  return upsertMarketplaceDraft({
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: "mcp_preset",
    sourceResourceType: "mcp_server",
    sourceResourceId: input.mcpServerId,
    version: input.version,
    changelog: input.changelog,
    name,
    description: input.description ?? null,
    visibility: input.visibility,
    tags: input.tags,
    manifest,
    metadata: { mcpServerId: input.mcpServerId, scope: "server" },
  });
}

export async function createMcpToolMarketplaceDraft(
  input: {
    workspaceId: string;
    userId: string;
    mcpToolId: string;
    version: string;
    name?: string;
    description?: string;
    visibility?: MarketplaceVisibility;
  } & DraftInputExtras,
) {
  const [tool] = await db
    .select()
    .from(mcpTools)
    .where(eq(mcpTools.id, input.mcpToolId))
    .limit(1);
  if (!tool) throw new Error("MCP tool not found");

  const [server] = await db
    .select()
    .from(mcpServers)
    .where(
      and(
        eq(mcpServers.id, tool.mcpServerId),
        eq(mcpServers.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!server || server.createdById !== input.userId) {
    throw new Error("MCP server not found");
  }

  const name = input.name || `${server.name} — ${tool.name}`;
  const manifest = buildMcpPresetManifest(
    name,
    input.description ?? tool.description,
    server,
    [tool],
    "tool",
  );

  return upsertMarketplaceDraft({
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: "mcp_preset",
    sourceResourceType: "mcp_tool",
    sourceResourceId: input.mcpToolId,
    version: input.version,
    changelog: input.changelog,
    name,
    description: input.description ?? tool.description,
    visibility: input.visibility,
    tags: input.tags,
    manifest,
    metadata: {
      mcpToolId: input.mcpToolId,
      mcpServerId: server.id,
      scope: "tool",
    },
  });
}
