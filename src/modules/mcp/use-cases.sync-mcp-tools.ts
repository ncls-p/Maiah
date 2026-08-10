import { logger } from "@/lib/logger";
import { listRemoteMcpTools } from "@/modules/mcp/client";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { mcpServers, mcpTools } from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";
import { createMcpServer, getMcpServer } from "./use-cases.create-mcp-server";
import {
  CreateMcpServerInput,
  DiscoveredMcpTool,
  UpdateMcpServerInput,
  assertCanManageMcpServer,
  hasMcpConnectionChanges,
} from "./use-cases.mcp-server";
import {
  discoverMcpTools,
  emitMcpToolsSyncedAudit,
  markMcpServerManual,
  saveMcpToolSyncResult,
  updateMcpServer,
} from "./use-cases.update-mcp-server";

export async function syncMcpTools(
  serverId: string,
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  const server = await getMcpServer(serverId, workspaceId);
  if (!server) throw new Error("MCP server not found");
  await assertCanManageMcpServer(server, userId, canManageGlobal);
  if (server.transport === "stdio" || !server.url) {
    await markMcpServerManual(serverId);
    return { status: "manual", discovered: 0 };
  }

  let discovered: DiscoveredMcpTool[] = [];
  let healthStatus = "healthy";
  let syncError: unknown;

  try {
    discovered = await discoverMcpTools(server, serverId);
  } catch (error) {
    healthStatus = "unhealthy";
    syncError = error;
  }

  if (syncError) {
    logger.warn("MCP tool sync failed", {
      serverId,
      error: syncError instanceof Error ? syncError.message : String(syncError),
    });
  }

  await saveMcpToolSyncResult(serverId, discovered, healthStatus);
  await emitMcpToolsSyncedAudit({
    workspaceId,
    userId,
    serverId,
    healthStatus,
    discoveredCount: discovered.length,
  });

  return { status: healthStatus, discovered: discovered.length };
}

export async function createMcpServerWithDiscovery(
  input: CreateMcpServerInput,
  canManageGlobal = false,
) {
  const server = await createMcpServer(input);
  const discovery = await syncMcpTools(
    server.id,
    input.workspaceId,
    input.userId,
    canManageGlobal,
  );
  return { server, discovery };
}

export async function updateMcpServerWithDiscovery(
  input: UpdateMcpServerInput,
) {
  const server = await updateMcpServer(input);
  const discovery = hasMcpConnectionChanges(input)
    ? await syncMcpTools(
        input.serverId,
        input.workspaceId,
        input.userId,
        input.canManageGlobal,
      )
    : null;
  return { server, discovery };
}

export async function testMcpConnection(
  serverId: string,
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  const server = await getMcpServer(serverId, workspaceId);
  if (!server) throw new Error("MCP server not found");
  await assertCanManageMcpServer(server, userId, canManageGlobal);

  if (server.transport === "stdio" || !server.url) {
    await db
      .update(mcpServers)
      .set({ healthStatus: "manual", lastCheckedAt: new Date() })
      .where(eq(mcpServers.id, serverId));
    return {
      status: "manual",
      message: "stdio servers require manual tool registration",
    };
  }

  let healthStatus = "healthy";
  let message = "Connection successful";

  try {
    const tools = await listRemoteMcpTools(server);
    message =
      tools.length > 0
        ? `Connected — ${tools.length} tools available`
        : "Connected — no tools returned";
  } catch (error) {
    healthStatus = "unhealthy";
    message =
      error instanceof Error ? error.message : "Unable to reach MCP server";
  }

  await db
    .update(mcpServers)
    .set({
      healthStatus,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mcpServers.id, serverId));

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "mcpServer.tested",
    resourceType: "mcp_server",
    resourceId: serverId,
    outcome: healthStatus === "healthy" ? "success" : "failed",
  });

  return { status: healthStatus, message };
}

export async function updateMcpTool(input: {
  toolId: string;
  serverId: string;
  workspaceId: string;
  userId: string;
  enabled?: boolean;
  requireApproval?: boolean;
  canManageGlobal?: boolean;
}) {
  const server = await getMcpServer(input.serverId, input.workspaceId);
  if (!server) throw new Error("MCP server not found");
  await assertCanManageMcpServer(server, input.userId, input.canManageGlobal);

  const updates: Record<string, unknown> = {};
  if (input.enabled !== undefined) updates.enabled = input.enabled;
  if (input.requireApproval !== undefined)
    updates.requireApproval = input.requireApproval;
  if (Object.keys(updates).length === 0) {
    throw new Error("No updates provided");
  }

  const [tool] = await db
    .update(mcpTools)
    .set(updates)
    .where(
      and(
        eq(mcpTools.id, input.toolId),
        eq(mcpTools.mcpServerId, input.serverId),
      ),
    )
    .returning();

  if (!tool) throw new Error("MCP tool not found");

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "mcpTool.updated",
    resourceType: "mcp_server",
    resourceId: input.serverId,
    outcome: "success",
    metadata: {
      toolId: input.toolId,
      enabled: input.enabled,
      requireApproval: input.requireApproval,
    },
  });

  return tool;
}
