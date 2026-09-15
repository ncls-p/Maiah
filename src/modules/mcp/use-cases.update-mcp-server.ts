import { applyResourceAccessSelection } from "@/modules/iam/resource-access-scope";
import { listRemoteMcpTools } from "@/modules/mcp/client";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { mcpServers, mcpTools } from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";
import {
  buildMcpServerUpdates,
  getMcpServer,
  validateMcpServerUpdate,
} from "./use-cases.create-mcp-server";
import {
  DiscoveredMcpTool,
  McpServer,
  UpdateMcpServerInput,
  assertCanManageMcpServer,
} from "./use-cases.mcp-server";

export async function updateMcpServer(input: UpdateMcpServerInput) {
  const existing = await getMcpServer(input.serverId, input.workspaceId);
  if (!existing) throw new Error("MCP server not found");
  await assertCanManageMcpServer(
    existing,
    input.userId,
    input.canManageGlobal && existing.workspaceId === input.workspaceId,
  );
  if (input.isGlobal && !input.canManageGlobal) {
    throw new Error("Only admins can make MCP servers global");
  }

  validateMcpServerUpdate(input, existing);
  if (input.accessScope) {
    await applyResourceAccessSelection({
      resourceType: "mcp_server",
      resourceId: input.serverId,
      userId: input.userId,
      selection: { scope: input.accessScope, teamId: input.accessTeamId },
    });
  }
  const updates = await buildMcpServerUpdates(input, existing);

  const [server] = await db
    .update(mcpServers)
    .set(updates)
    .where(eq(mcpServers.id, input.serverId))
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "mcpServer.updated",
    resourceType: "mcp_server",
    resourceId: input.serverId,
    outcome: "success",
  });

  return server;
}

export async function archiveMcpServer(
  serverId: string,
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  const existing = await getMcpServer(serverId, workspaceId);
  if (!existing) throw new Error("MCP server not found");
  await assertCanManageMcpServer(
    existing,
    userId,
    canManageGlobal && existing.workspaceId === workspaceId,
  );

  await db
    .update(mcpServers)
    .set({ archivedAt: new Date(), updatedAt: new Date(), enabled: false })
    .where(eq(mcpServers.id, serverId));

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "mcpServer.archived",
    resourceType: "mcp_server",
    resourceId: serverId,
    outcome: "success",
  });
}

export async function listMcpTools(
  serverId: string,
  workspaceId: string,
  userId?: string,
) {
  const server = await getMcpServer(serverId, workspaceId, userId);
  if (!server) throw new Error("MCP server not found");
  return db
    .select()
    .from(mcpTools)
    .where(eq(mcpTools.mcpServerId, serverId))
    .orderBy(mcpTools.name);
}

export async function markMcpServerManual(serverId: string) {
  await db
    .update(mcpServers)
    .set({ healthStatus: "manual", lastCheckedAt: new Date() })
    .where(eq(mcpServers.id, serverId));
}

async function existingToolApprovalByName(serverId: string) {
  const existingTools = await db
    .select({
      name: mcpTools.name,
      requireApproval: mcpTools.requireApproval,
    })
    .from(mcpTools)
    .where(eq(mcpTools.mcpServerId, serverId));
  return new Map(
    existingTools.map((tool) => [tool.name, tool.requireApproval]),
  );
}

function discoveredMcpTool(
  tool: Awaited<ReturnType<typeof listRemoteMcpTools>>[number],
  approvalByName: Map<string, boolean>,
): DiscoveredMcpTool {
  return {
    name: tool.name,
    description: typeof tool.description === "string" ? tool.description : null,
    inputSchemaJson:
      (tool.inputSchema as Record<string, unknown> | undefined) ?? null,
    outputSchemaJson:
      (tool.outputSchema as Record<string, unknown> | undefined) ?? null,
    requireApproval: approvalByName.get(tool.name) ?? false,
  };
}

export async function discoverMcpTools(
  server: McpServer,
  serverId: string,
  userId?: string,
): Promise<DiscoveredMcpTool[]> {
  const approvalByName = await existingToolApprovalByName(serverId);
  const remoteTools = await listRemoteMcpTools(server, { userId });
  return remoteTools.map((tool) => discoveredMcpTool(tool, approvalByName));
}

export async function saveMcpToolSyncResult(
  serverId: string,
  discovered: DiscoveredMcpTool[],
  healthStatus: string,
) {
  await db.transaction(async (tx) => {
    if (healthStatus === "healthy") {
      await tx
        .select({ id: mcpServers.id })
        .from(mcpServers)
        .where(eq(mcpServers.id, serverId))
        .for("update");
      const existing = await tx
        .select()
        .from(mcpTools)
        .where(eq(mcpTools.mcpServerId, serverId));
      const byName = new Map(existing.map((tool) => [tool.name, tool]));
      const discoveredNames = new Set(discovered.map((tool) => tool.name));
      if (discoveredNames.size !== discovered.length)
        throw new Error("MCP_DUPLICATE_TOOL_NAME");
      for (const tool of discovered) {
        const current = byName.get(tool.name);
        const metadata = {
          description: tool.description,
          inputSchemaJson: tool.inputSchemaJson,
          outputSchemaJson: tool.outputSchemaJson,
        };
        if (!current)
          await tx.insert(mcpTools).values({
            mcpServerId: serverId,
            name: tool.name,
            ...metadata,
            enabled: true,
            requireApproval: tool.requireApproval,
          });
        else if (
          current.description !== metadata.description ||
          JSON.stringify(current.inputSchemaJson) !==
            JSON.stringify(metadata.inputSchemaJson) ||
          JSON.stringify(current.outputSchemaJson) !==
            JSON.stringify(metadata.outputSchemaJson)
        ) {
          await tx
            .update(mcpTools)
            .set({ ...metadata, discoveredAt: new Date() })
            .where(eq(mcpTools.id, current.id));
        }
      }
      for (const tool of existing)
        if (!discoveredNames.has(tool.name) && tool.enabled)
          await tx
            .update(mcpTools)
            .set({ enabled: false })
            .where(eq(mcpTools.id, tool.id));
    }
    await tx
      .update(mcpServers)
      .set({
        healthStatus,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mcpServers.id, serverId));
  });
}

export async function emitMcpToolsSyncedAudit(input: {
  workspaceId: string;
  userId: string;
  serverId: string;
  healthStatus: string;
  discoveredCount: number;
}) {
  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "mcpServer.toolsSynced",
    resourceType: "mcp_server",
    resourceId: input.serverId,
    outcome: input.healthStatus === "healthy" ? "success" : "failed",
    metadata: { discovered: input.discoveredCount },
  });
}
