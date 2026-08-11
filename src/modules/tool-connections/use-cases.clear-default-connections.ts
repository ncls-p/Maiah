import { logger } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  toolConnections,
  toolConnectors,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  CreateToolConnectorInput,
  ToolConnection,
  ToolConnector,
  jsonRecord,
  normalizeConnectorKey,
} from "./use-cases.mcp-tool-source";

export async function clearDefaultConnections(
  client: Pick<typeof db, "update">,
  connection: Pick<
    ToolConnection,
    "workspaceId" | "connectorId" | "ownerType" | "ownerUserId"
  >,
) {
  await client
    .update(toolConnections)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(
      and(
        eq(toolConnections.workspaceId, connection.workspaceId),
        eq(toolConnections.connectorId, connection.connectorId),
        connection.ownerType === "workspace"
          ? and(
              eq(toolConnections.ownerType, "workspace"),
              isNull(toolConnections.ownerUserId),
            )
          : and(
              eq(toolConnections.ownerType, "user"),
              eq(toolConnections.ownerUserId, connection.ownerUserId ?? ""),
            ),
      ),
    );
}

export function toSafeToolConnector(connector: ToolConnector) {
  return {
    id: connector.id,
    workspaceId: connector.workspaceId,
    key: connector.key,
    name: connector.name,
    description: connector.description,
    kind: connector.kind,
    mcpServerId: connector.mcpServerId,
    configSchema: connector.configSchemaJson,
    secretSchema: connector.secretSchemaJson,
    defaultConfig: connector.defaultConfigJson,
    enabled: connector.enabled,
    isGlobal: connector.isGlobal,
    createdById: connector.createdById,
    createdAt: connector.createdAt,
    updatedAt: connector.updatedAt,
  };
}

export function toSafeToolConnection(connection: ToolConnection) {
  return {
    id: connection.id,
    workspaceId: connection.workspaceId,
    connectorId: connection.connectorId,
    ownerType: connection.ownerType,
    ownerUserId: connection.ownerUserId,
    label: connection.label,
    config: connection.configJson,
    hasSecrets:
      Boolean(connection.encryptedSecretsJson) &&
      Object.keys(jsonRecord(connection.encryptedSecretsJson)).length > 0,
    isDefault: connection.isDefault,
    status: connection.status,
    lastValidatedAt: connection.lastValidatedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export async function createToolConnector(input: CreateToolConnectorInput) {
  const key = normalizeConnectorKey(input.key);
  if (!key) throw new Error("Tool connector key is required");

  const [connector] = await db
    .insert(toolConnectors)
    .values({
      workspaceId: input.workspaceId,
      createdById: input.userId,
      key,
      name: input.name,
      description: input.description || null,
      kind: input.kind,
      mcpServerId: input.mcpServerId || null,
      configSchemaJson: input.configSchema ?? null,
      secretSchemaJson: input.secretSchema ?? null,
      defaultConfigJson: input.defaultConfig ?? null,
      isGlobal: input.isGlobal ?? false,
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "toolConnector.created",
    resourceType: "mcp_server",
    resourceId: connector.mcpServerId ?? connector.id,
    outcome: "success",
    metadata: {
      connectorId: connector.id,
      key: connector.key,
      kind: connector.kind,
    },
  });

  logger.info("Tool connector created", {
    connectorId: connector.id,
    workspaceId: input.workspaceId,
    userId: input.userId,
  });
  return connector;
}

export async function listToolConnectors(
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  const connectors = await db
    .select()
    .from(toolConnectors)
    .where(
      and(
        eq(toolConnectors.workspaceId, workspaceId),
        isNull(toolConnectors.archivedAt),
      ),
    )
    .orderBy(toolConnectors.name);
  const visibleConnectors = await Promise.all(
    connectors.map(async (connector) =>
      connector.createdById === userId ||
      connector.isGlobal ||
      canManageGlobal ||
      (await authorization.hasDirectPermission(
        { principalType: "user", principalId: userId },
        "tools.view",
        "tool_connector",
        connector.id,
        workspaceId,
      ))
        ? toSafeToolConnector(connector)
        : null,
    ),
  );
  return visibleConnectors.filter((connector) => connector !== null);
}

export async function getToolConnector(
  connectorId: string,
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  const [connector] = await db
    .select()
    .from(toolConnectors)
    .where(
      and(
        eq(toolConnectors.id, connectorId),
        eq(toolConnectors.workspaceId, workspaceId),
        isNull(toolConnectors.archivedAt),
      ),
    )
    .limit(1);
  if (!connector) return null;
  const visible =
    connector.createdById === userId ||
    connector.isGlobal ||
    canManageGlobal ||
    (await authorization.hasDirectPermission(
      { principalType: "user", principalId: userId },
      "tools.view",
      "tool_connector",
      connector.id,
      workspaceId,
    ));
  return visible ? connector : null;
}
