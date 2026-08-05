
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
toolConnections
} from "@/server/infrastructure/db/schema";
import { and,desc,eq,isNull } from "drizzle-orm";
import {
clearDefaultConnections,
getToolConnector,
toSafeToolConnection,
} from "./use-cases.clear-default-connections";
import {
CreateToolConnectionInput,
UpdateToolConnectionInput,
canManageConnection,
encryptRecord,
} from "./use-cases.mcp-tool-source";

export async function createToolConnection(input: CreateToolConnectionInput) {
  const ownerType = input.ownerType ?? "user";
  if (ownerType === "workspace" && !input.canManageWorkspaceConnections) {
    throw new Error("Only admins can create workspace tool connections");
  }

  const connector = await getToolConnector(
    input.connectorId,
    input.workspaceId,
    input.userId,
    input.canManageWorkspaceConnections,
  );
  if (!connector || !connector.enabled)
    throw new Error("Tool connector not found");

  const connectionSeed = {
    workspaceId: input.workspaceId,
    connectorId: input.connectorId,
    ownerType,
    ownerUserId: ownerType === "user" ? input.userId : null,
  };

  const [connection] = await db.transaction(async (tx) => {
    if (input.isDefault) await clearDefaultConnections(tx, connectionSeed);
    return tx
      .insert(toolConnections)
      .values({
        ...connectionSeed,
        label: input.label,
        configJson: input.config ?? null,
        encryptedSecretsJson: await encryptRecord(input.secrets),
        isDefault: input.isDefault ?? false,
        status: "active",
      })
      .returning();
  });

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "toolConnection.created",
    resourceType: "mcp_server",
    resourceId: connector.mcpServerId ?? connector.id,
    outcome: "success",
    metadata: {
      connectorId: connector.id,
      connectionId: connection.id,
      ownerType,
    },
  });

  return connection;
}

export async function listToolConnections(
  workspaceId: string,
  userId: string,
  canManageWorkspaceConnections = false,
) {
  const connections = await db
    .select()
    .from(toolConnections)
    .where(
      and(
        eq(toolConnections.workspaceId, workspaceId),
        isNull(toolConnections.archivedAt),
      ),
    )
    .orderBy(desc(toolConnections.isDefault), desc(toolConnections.createdAt));
  const visibleConnections = await Promise.all(
    connections.map(async (connection) =>
      (await canManageConnection(
        connection,
        userId,
        canManageWorkspaceConnections,
      ))
        ? toSafeToolConnection(connection)
        : null,
    ),
  );
  return visibleConnections.filter((connection) => connection !== null);
}

export async function updateToolConnection(input: UpdateToolConnectionInput) {
  const [existing] = await db
    .select()
    .from(toolConnections)
    .where(
      and(
        eq(toolConnections.id, input.connectionId),
        eq(toolConnections.workspaceId, input.workspaceId),
        isNull(toolConnections.archivedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Tool connection not found");
  if (
    !(await canManageConnection(
      existing,
      input.userId,
      input.canManageWorkspaceConnections,
    ))
  ) {
    throw new Error("Not allowed to manage this tool connection");
  }

  const updates = {
    label: input.label,
    configJson: input.config === undefined ? undefined : input.config,
    encryptedSecretsJson:
      input.secrets === undefined
        ? undefined
        : await encryptRecord(input.secrets),
    isDefault: input.isDefault,
    status: input.status,
    updatedAt: new Date(),
  };

  const [connection] = await db.transaction(async (tx) => {
    if (input.isDefault) await clearDefaultConnections(tx, existing);
    return tx
      .update(toolConnections)
      .set(updates)
      .where(eq(toolConnections.id, input.connectionId))
      .returning();
  });

  return connection;
}

export async function archiveToolConnection(
  connectionId: string,
  workspaceId: string,
  userId: string,
  canManageWorkspaceConnections = false,
) {
  const [existing] = await db
    .select()
    .from(toolConnections)
    .where(
      and(
        eq(toolConnections.id, connectionId),
        eq(toolConnections.workspaceId, workspaceId),
        isNull(toolConnections.archivedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Tool connection not found");
  if (
    !(await canManageConnection(
      existing,
      userId,
      canManageWorkspaceConnections,
    ))
  ) {
    throw new Error("Not allowed to manage this tool connection");
  }

  await db
    .update(toolConnections)
    .set({ archivedAt: new Date(), updatedAt: new Date(), isDefault: false })
    .where(eq(toolConnections.id, connectionId));
  return { success: true };
}
