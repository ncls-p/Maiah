import { aiModels,aiProviders,mcpServers,mcpTools,toolConnectionRequirements,toolConnections,toolConnectors } from "@/server/infrastructure/db/schema";
import { and,eq,inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { WorkspaceCloneContext } from "./workspace-clone.context";

export async function cloneProviderInfrastructure(context: WorkspaceCloneContext) {
  const { tx, input, disableSecrets, suffix, providerMap, modelMap, mcpMap, mcpToolMap, connectorMap, connectionMap } = context;
  const sourceProviders = await tx.select().from(aiProviders).where(eq(aiProviders.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceProviders) {
    const id = randomUUID();
    providerMap.set(source.id, id);
    await tx.insert(aiProviders).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      encryptedApiKey: disableSecrets ? null : source.encryptedApiKey,
      encryptedHeadersJson: disableSecrets ? null : source.encryptedHeadersJson,
      enabled: disableSecrets ? false : source.enabled,
      healthStatus: null,
      lastCheckedAt: null,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (sourceProviders.length > 0) {
    const sourceModels = await tx
      .select()
      .from(aiModels)
      .where(
        inArray(
          aiModels.providerId,
          sourceProviders.map(({ id }) => id),
        ),
      );
    for (const source of sourceModels) {
      const id = randomUUID();
      modelMap.set(source.id, id);
      await tx.insert(aiModels).values({
        ...source,
        id,
        providerId: providerMap.get(source.providerId)!,
        enabled: disableSecrets ? false : source.enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  const sourceMcpServers = await tx.select().from(mcpServers).where(eq(mcpServers.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceMcpServers) {
    const id = randomUUID();
    mcpMap.set(source.id, id);
    await tx.insert(mcpServers).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      encryptedHeadersJson: disableSecrets ? null : source.encryptedHeadersJson,
      encryptedEnvJson: disableSecrets ? null : source.encryptedEnvJson,
      enabled: disableSecrets ? false : source.enabled,
      healthStatus: null,
      lastCheckedAt: null,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (sourceMcpServers.length > 0) {
    const sourceMcpTools = await tx
      .select()
      .from(mcpTools)
      .where(
        inArray(
          mcpTools.mcpServerId,
          sourceMcpServers.map(({ id }) => id),
        ),
      );
    for (const source of sourceMcpTools) {
      const id = randomUUID();
      mcpToolMap.set(source.id, id);
      await tx.insert(mcpTools).values({
        ...source,
        id,
        mcpServerId: mcpMap.get(source.mcpServerId)!,
        enabled: disableSecrets ? false : source.enabled,
      });
    }
  }

  const sourceConnectors = await tx.select().from(toolConnectors).where(eq(toolConnectors.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceConnectors) {
    const id = randomUUID();
    connectorMap.set(source.id, id);
    await tx.insert(toolConnectors).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      key: `${source.key}-${suffix}`,
      mcpServerId: source.mcpServerId ? (mcpMap.get(source.mcpServerId) ?? null) : null,
      enabled: disableSecrets ? false : source.enabled,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (sourceConnectors.length > 0) {
    const connectorIds = sourceConnectors.map(({ id }) => id);
    const sourceConnections = await tx
      .select()
      .from(toolConnections)
      .where(and(eq(toolConnections.workspaceId, input.sourceWorkspaceId), inArray(toolConnections.connectorId, connectorIds)));
    for (const source of sourceConnections) {
      const id = randomUUID();
      connectionMap.set(source.id, id);
      await tx.insert(toolConnections).values({
        ...source,
        id,
        workspaceId: input.targetWorkspaceId,
        connectorId: connectorMap.get(source.connectorId)!,
        encryptedSecretsJson: disableSecrets ? null : source.encryptedSecretsJson,
        status: disableSecrets ? "disabled" : source.status,
        isDefault: false,
        lastValidatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    context.pendingRequirements = await tx
      .select()
      .from(toolConnectionRequirements)
      .where(and(eq(toolConnectionRequirements.workspaceId, input.sourceWorkspaceId), inArray(toolConnectionRequirements.connectorId, connectorIds)));
  }
}
