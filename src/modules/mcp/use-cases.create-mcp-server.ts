import { and, eq, isNull, sql } from "drizzle-orm";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { inferMcpAuthHint } from "@/modules/mcp/auth-hint";
import { listRemoteMcpTools } from "@/modules/mcp/client";
import { logger } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { mcpServers, mcpTools } from "@/server/infrastructure/db/schema";
import {
  CreateMcpServerInput,
  McpServer,
  UpdateMcpServerInput,
  canManageMcpServer,
  encryptRecord,
  mergeEncryptedRecord,
  toSafeMcpServer,
  validateTransportConfig,
} from "./use-cases.mcp-server";

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
      and(
        eq(mcpServers.workspaceId, workspaceId),
        isNull(mcpServers.archivedAt),
      ),
    )
    .orderBy(
      sql`${mcpServers.isGlobal} DESC`,
      sql`${mcpServers.createdAt} DESC`,
    );
  const visibleRows = userId
    ? (
        await Promise.all(
          rows.map(async (server) => {
            const visible =
              server.createdById === userId ||
              server.isGlobal ||
              (await authorization.hasPermission(
                { principalType: "user", principalId: userId },
                "mcpServers.get",
                "mcp_server",
                server.id,
              ));
            if (!visible) return null;
            const canEdit =
              canManageMcpServer(server, userId, canManageGlobal) ||
              (await authorization.hasPermission(
                { principalType: "user", principalId: userId },
                "mcpServers.manage",
                "mcp_server",
                server.id,
              ));
            return { ...toSafeMcpServer(server), canEdit };
          }),
        )
      ).filter((server) => server !== null)
    : rows.map((server) => ({ ...toSafeMcpServer(server), canEdit: true }));
  return visibleRows;
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
      ),
    )
    .limit(1);
  if (
    server &&
    userId &&
    server.createdById !== userId &&
    !server.isGlobal &&
    !(await authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "mcpServers.get",
      "mcp_server",
      server.id,
    ))
  ) {
    return null;
  }
  return server ?? null;
}

function nullableTextUpdate(value?: string) {
  return value === undefined ? undefined : value || null;
}

function nextNullableText(value: string | undefined, current: string | null) {
  return value === undefined ? current : value || null;
}

export function validateMcpServerUpdate(
  input: UpdateMcpServerInput,
  existing: McpServer,
) {
  validateTransportConfig(
    input.transport ?? existing.transport,
    nextNullableText(input.url, existing.url),
    nextNullableText(input.command, existing.command),
  );
}

export async function buildMcpServerUpdates(
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
