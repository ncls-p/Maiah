import { and, eq, isNull, or, sql } from "drizzle-orm";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { inferMcpAuthHint } from "@/modules/mcp/auth-hint";
import { listRemoteMcpTools } from "@/modules/mcp/client";
import { logger } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { mcpServers, mcpTools } from "@/server/infrastructure/db/schema";

type McpServer = typeof mcpServers.$inferSelect;

type McpTransport = McpServer["transport"];

type DiscoveredMcpTool = {
  name: string;
  description: string | null;
  inputSchemaJson: Record<string, unknown> | null;
  outputSchemaJson: Record<string, unknown> | null;
  requireApproval: boolean;
};

export interface CreateMcpServerInput {
  workspaceId: string;
  userId: string;
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  requireApproval?: boolean;
  isGlobal?: boolean;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface UpdateMcpServerInput {
  serverId: string;
  workspaceId: string;
  userId: string;
  canManageGlobal?: boolean;
  name?: string;
  transport?: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
  enabled?: boolean;
  requireApproval?: boolean;
  isGlobal?: boolean;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export function toSafeMcpServer(server: McpServer) {
  return {
    id: server.id,
    workspaceId: server.workspaceId,
    name: server.name,
    transport: server.transport,
    command: server.command,
    argsJson: server.argsJson,
    url: server.url,
    enabled: server.enabled,
    requireApproval: server.requireApproval,
    isGlobal: server.isGlobal,
    createdById: server.createdById,
    healthStatus: server.healthStatus,
    lastCheckedAt: server.lastCheckedAt,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    hasHeaders: Boolean(server.encryptedHeadersJson),
    hasEnv: Boolean(server.encryptedEnvJson),
  };
}

export function toMcpServerForEdit(server: McpServer) {
  return {
    ...toSafeMcpServer(server),
    authHint: inferMcpAuthHint(server),
  };
}

async function encryptRecord(record?: Record<string, string>) {
  if (!record || Object.keys(record).length === 0) return null;
  const encrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    encrypted[key] = await encryptValue(value);
  }
  return encrypted;
}

async function decryptRecord(
  encrypted?: Record<string, string> | null,
): Promise<Record<string, string>> {
  if (!encrypted) return {};
  const decrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(encrypted)) {
    decrypted[key] = await decryptValue(value);
  }
  return decrypted;
}

async function mergeEncryptedRecord(
  existing: Record<string, string> | null | undefined,
  incoming: Record<string, string>,
) {
  const merged = await decryptRecord(existing ?? null);
  for (const [key, value] of Object.entries(incoming)) {
    if (value.trim()) {
      merged[key] = value;
    }
  }
  return encryptRecord(merged);
}

function validateTransportConfig(
  transport: McpTransport,
  url: string | null,
  command: string | null,
) {
  if (transport === "stdio" && !command?.trim()) {
    throw new Error("Command is required for stdio transport");
  }
  if (
    (transport === "sse" || transport === "streamable-http") &&
    !url?.trim()
  ) {
    throw new Error("URL is required for remote transport");
  }
}

function visibleMcpServerCondition(workspaceId: string, userId: string) {
  return and(
    eq(mcpServers.workspaceId, workspaceId),
    isNull(mcpServers.archivedAt),
    or(eq(mcpServers.createdById, userId), eq(mcpServers.isGlobal, true)),
  );
}

function canManageMcpServer(
  server: McpServer,
  userId: string,
  canManageGlobal = false,
) {
  return server.createdById === userId || (server.isGlobal && canManageGlobal);
}

function assertCanManageMcpServer(
  server: McpServer,
  userId: string,
  canManageGlobal = false,
) {
  if (!canManageMcpServer(server, userId, canManageGlobal)) {
    throw new Error("MCP server not found");
  }
}

export async function createMcpServer(input: CreateMcpServerInput) {
  const [server] = await db
    .insert(mcpServers)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      transport: input.transport,
      command: input.command || null,
      argsJson: input.args ?? null,
      url: input.url || null,
      encryptedHeadersJson: await encryptRecord(input.headers),
      encryptedEnvJson: await encryptRecord(input.env),
      enabled: true,
      requireApproval: input.requireApproval ?? false,
      isGlobal: input.isGlobal ?? false,
      healthStatus: "unknown",
      createdById: input.userId,
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "mcpServer.created",
    resourceType: "mcp_server",
    resourceId: server.id,
    outcome: "success",
    metadata: { name: input.name, transport: input.transport },
  });

  logger.info("MCP server created", {
    serverId: server.id,
    userId: input.userId,
  });
  return server;
}

export async function listMcpServers(
  workspaceId: string,
  userId?: string,
  canManageGlobal = false,
) {
  const rows = await db
    .select()
    .from(mcpServers)
    .where(
      userId
        ? visibleMcpServerCondition(workspaceId, userId)
        : and(
            eq(mcpServers.workspaceId, workspaceId),
            isNull(mcpServers.archivedAt),
          ),
    )
    .orderBy(
      sql`${mcpServers.isGlobal} DESC`,
      sql`${mcpServers.createdAt} DESC`,
    );
  return rows.map((server) => ({
    ...toSafeMcpServer(server),
    canEdit: userId
      ? canManageMcpServer(server, userId, canManageGlobal)
      : true,
  }));
}

export async function getMcpServer(
  serverId: string,
  workspaceId: string,
  userId?: string,
) {
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(
      and(
        eq(mcpServers.id, serverId),
        eq(mcpServers.workspaceId, workspaceId),
        isNull(mcpServers.archivedAt),
        userId
          ? or(
              eq(mcpServers.createdById, userId),
              eq(mcpServers.isGlobal, true),
            )
          : undefined,
      ),
    )
    .limit(1);
  return server ?? null;
}

function nullableTextUpdate(value?: string) {
  return value === undefined ? undefined : value || null;
}

function nextNullableText(value: string | undefined, current: string | null) {
  return value === undefined ? current : value || null;
}

function validateMcpServerUpdate(
  input: UpdateMcpServerInput,
  existing: McpServer,
) {
  validateTransportConfig(
    input.transport ?? existing.transport,
    nextNullableText(input.url, existing.url),
    nextNullableText(input.command, existing.command),
  );
}

async function buildMcpServerUpdates(
  input: UpdateMcpServerInput,
  existing: McpServer,
) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const simpleUpdates: Array<[string, unknown]> = [
    ["name", input.name],
    ["transport", input.transport],
    ["url", nullableTextUpdate(input.url)],
    ["command", nullableTextUpdate(input.command)],
    ["argsJson", input.args],
    ["enabled", input.enabled],
    ["requireApproval", input.requireApproval],
    ["isGlobal", input.isGlobal],
  ];

  for (const [field, value] of simpleUpdates) {
    if (value !== undefined) updates[field] = value;
  }
  if (input.headers !== undefined) {
    updates.encryptedHeadersJson = await mergeEncryptedRecord(
      existing.encryptedHeadersJson as Record<string, string> | null,
      input.headers,
    );
  }
  if (input.env !== undefined) {
    updates.encryptedEnvJson = await mergeEncryptedRecord(
      existing.encryptedEnvJson as Record<string, string> | null,
      input.env,
    );
  }

  return updates;
}

export async function updateMcpServer(input: UpdateMcpServerInput) {
  const existing = await getMcpServer(input.serverId, input.workspaceId);
  if (!existing) throw new Error("MCP server not found");
  assertCanManageMcpServer(existing, input.userId, input.canManageGlobal);
  if (input.isGlobal && !input.canManageGlobal) {
    throw new Error("Only admins can make MCP servers global");
  }

  validateMcpServerUpdate(input, existing);
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
  assertCanManageMcpServer(existing, userId, canManageGlobal);

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

async function markMcpServerManual(serverId: string) {
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

async function discoverMcpTools(
  server: McpServer,
  serverId: string,
): Promise<DiscoveredMcpTool[]> {
  const approvalByName = await existingToolApprovalByName(serverId);
  const remoteTools = await listRemoteMcpTools(server);
  return remoteTools.map((tool) => discoveredMcpTool(tool, approvalByName));
}

async function saveMcpToolSyncResult(
  serverId: string,
  discovered: DiscoveredMcpTool[],
  healthStatus: string,
) {
  await db.transaction(async (tx) => {
    if (discovered.length > 0) {
      await tx.delete(mcpTools).where(eq(mcpTools.mcpServerId, serverId));
      await tx.insert(mcpTools).values(
        discovered.map((tool) => ({
          mcpServerId: serverId,
          name: tool.name,
          description: tool.description,
          inputSchemaJson: tool.inputSchemaJson,
          outputSchemaJson: tool.outputSchemaJson,
          enabled: true,
          requireApproval: tool.requireApproval,
        })),
      );
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

async function emitMcpToolsSyncedAudit(input: {
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

export async function syncMcpTools(
  serverId: string,
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  const server = await getMcpServer(serverId, workspaceId);
  if (!server) throw new Error("MCP server not found");
  assertCanManageMcpServer(server, userId, canManageGlobal);
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

export async function testMcpConnection(
  serverId: string,
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  const server = await getMcpServer(serverId, workspaceId);
  if (!server) throw new Error("MCP server not found");
  assertCanManageMcpServer(server, userId, canManageGlobal);

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
  assertCanManageMcpServer(server, input.userId, input.canManageGlobal);

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
