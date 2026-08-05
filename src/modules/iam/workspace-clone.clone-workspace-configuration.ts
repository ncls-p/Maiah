import { randomUUID } from "node:crypto";

import { and,eq,inArray } from "drizzle-orm";

import { agentDelegationBindings,agentKnowledgeBindings,agentSkillBindings,agentSkills,agentToolBindings,agentVersions,agents,aiModels,aiProviders,customTools,documentChunks,documentEmbeddings,documents,knowledgeBases,marketplaceInstalls,mcpServers,mcpTools,organizationMembers,roleBindings,roles,scheduledTasks,toolConnectionRequirements,toolConnections,toolConnectors,userAgentPreferences,userToolSettings,workflowVersions,workflows,workspaceMembers } from "@/server/infrastructure/db/schema";

import type { TransferSecretPolicy } from "./resource-transfer";
import { Executor,remapDefinition } from "./workspace-clone.executor";

export async function cloneWorkspaceConfiguration(
  tx: Executor,
  input: {
    actorUserId: string;
    sourceWorkspaceId: string;
    targetWorkspaceId: string;
    targetOrganizationId: string;
    secretPolicy: TransferSecretPolicy;
    groupPrincipalMap?: Map<string, string>;
    preserveGroupPrincipals?: boolean;
  },
) {
  const disableSecrets = input.secretPolicy === "disable";
  const suffix = `copy-${randomUUID().slice(0, 8)}`;
  const providerMap = new Map<string, string>();
  const modelMap = new Map<string, string>();
  const mcpMap = new Map<string, string>();
  const mcpToolMap = new Map<string, string>();
  const connectorMap = new Map<string, string>();
  const connectionMap = new Map<string, string>();
  const skillMap = new Map<string, string>();
  const knowledgeMap = new Map<string, string>();
  const documentMap = new Map<string, string>();
  const customToolMap = new Map<string, string>();
  const agentMap = new Map<string, string>();
  const versionMap = new Map<string, string>();
  const workflowMap = new Map<string, string>();
  const scheduledTaskMap = new Map<string, string>();
  const roleMap = new Map<string, string>();
  let pendingRequirements: (typeof toolConnectionRequirements.$inferSelect)[] = [];

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
    pendingRequirements = await tx
      .select()
      .from(toolConnectionRequirements)
      .where(and(eq(toolConnectionRequirements.workspaceId, input.sourceWorkspaceId), inArray(toolConnectionRequirements.connectorId, connectorIds)));
  }

  const sourceSkills = await tx.select().from(agentSkills).where(eq(agentSkills.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceSkills) {
    const id = randomUUID();
    skillMap.set(source.id, id);
    await tx.insert(agentSkills).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const sourceKnowledge = await tx.select().from(knowledgeBases).where(eq(knowledgeBases.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceKnowledge) {
    const id = randomUUID();
    knowledgeMap.set(source.id, id);
    await tx.insert(knowledgeBases).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (sourceKnowledge.length > 0) {
    const sourceDocuments = await tx
      .select()
      .from(documents)
      .where(
        inArray(
          documents.knowledgeBaseId,
          sourceKnowledge.map(({ id }) => id),
        ),
      );
    for (const source of sourceDocuments) {
      const id = randomUUID();
      documentMap.set(source.id, id);
      await tx.insert(documents).values({
        ...source,
        id,
        workspaceId: input.targetWorkspaceId,
        knowledgeBaseId: knowledgeMap.get(source.knowledgeBaseId)!,
        createdById: input.actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    if (sourceDocuments.length > 0) {
      const sourceChunks = await tx
        .select()
        .from(documentChunks)
        .where(
          inArray(
            documentChunks.documentId,
            sourceDocuments.map(({ id }) => id),
          ),
        );
      for (const source of sourceChunks) {
        const chunkId = randomUUID();
        await tx.insert(documentChunks).values({
          ...source,
          id: chunkId,
          documentId: documentMap.get(source.documentId)!,
          createdAt: new Date(),
        });
        const [embedding] = await tx.select().from(documentEmbeddings).where(eq(documentEmbeddings.chunkId, source.id)).limit(1);
        if (embedding) {
          await tx.insert(documentEmbeddings).values({
            ...embedding,
            id: randomUUID(),
            chunkId,
            createdAt: new Date(),
          });
        }
      }
    }
  }

  const sourceCustomTools = await tx.select().from(customTools).where(eq(customTools.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceCustomTools) {
    const id = randomUUID();
    customToolMap.set(source.id, id);
    await tx.insert(customTools).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      status: disableSecrets ? "disabled" : source.status,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  for (const source of pendingRequirements) {
    await tx.insert(toolConnectionRequirements).values({
      ...source,
      id: randomUUID(),
      workspaceId: input.targetWorkspaceId,
      connectorId: connectorMap.get(source.connectorId)!,
      toolId: mcpToolMap.get(source.toolId) ?? customToolMap.get(source.toolId) ?? source.toolId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const sourceToolSettings = await tx.select().from(userToolSettings).where(eq(userToolSettings.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceToolSettings) {
    await tx
      .insert(userToolSettings)
      .values({
        ...source,
        id: randomUUID(),
        workspaceId: input.targetWorkspaceId,
        toolId: mcpToolMap.get(source.toolId) ?? customToolMap.get(source.toolId) ?? source.toolId,
        connectionId: source.connectionId ? (connectionMap.get(source.connectionId) ?? null) : null,
        encryptedSecretsJson: disableSecrets ? null : source.encryptedSecretsJson,
        enabled: disableSecrets ? false : source.enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  const sourceAgents = await tx.select().from(agents).where(eq(agents.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceAgents) {
    const id = randomUUID();
    agentMap.set(source.id, id);
    await tx.insert(agents).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      slug: `${source.slug}-${suffix}`,
      activeVersionId: null,
      forkedFromAgentId: source.id,
      sourceType: "fork",
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (sourceAgents.length > 0) {
    const sourceVersions = await tx
      .select()
      .from(agentVersions)
      .where(
        inArray(
          agentVersions.agentId,
          sourceAgents.map(({ id }) => id),
        ),
      );
    for (const source of sourceVersions) {
      const id = randomUUID();
      versionMap.set(source.id, id);
      await tx.insert(agentVersions).values({
        ...source,
        id,
        agentId: agentMap.get(source.agentId)!,
        providerId: source.providerId ? (providerMap.get(source.providerId) ?? null) : null,
        modelId: source.modelId ? (modelMap.get(source.modelId) ?? null) : null,
        createdById: input.actorUserId,
        createdAt: new Date(),
      });
    }
    for (const source of sourceAgents) {
      await tx
        .update(agents)
        .set({
          activeVersionId: source.activeVersionId ? (versionMap.get(source.activeVersionId) ?? null) : null,
        })
        .where(eq(agents.id, agentMap.get(source.id)!));
    }
    const versionIds = sourceVersions.map(({ id }) => id);
    const [toolBindings, knowledgeBindings, skillBindings, delegationBindings] = await Promise.all([tx.select().from(agentToolBindings).where(inArray(agentToolBindings.agentVersionId, versionIds)), tx.select().from(agentKnowledgeBindings).where(inArray(agentKnowledgeBindings.agentVersionId, versionIds)), tx.select().from(agentSkillBindings).where(inArray(agentSkillBindings.agentVersionId, versionIds)), tx.select().from(agentDelegationBindings).where(inArray(agentDelegationBindings.agentVersionId, versionIds))]);
    for (const source of toolBindings) {
      const mappedToolId = source.toolSource === "mcp" ? mcpToolMap.get(source.toolId) : source.toolSource === "custom" ? customToolMap.get(source.toolId) : source.toolId;
      if (mappedToolId)
        await tx.insert(agentToolBindings).values({
          ...source,
          id: randomUUID(),
          agentVersionId: versionMap.get(source.agentVersionId)!,
          toolId: mappedToolId,
          createdAt: new Date(),
        });
    }
    for (const source of knowledgeBindings)
      await tx.insert(agentKnowledgeBindings).values({
        ...source,
        id: randomUUID(),
        agentVersionId: versionMap.get(source.agentVersionId)!,
        knowledgeBaseId: knowledgeMap.get(source.knowledgeBaseId)!,
        createdAt: new Date(),
      });
    for (const source of skillBindings)
      await tx.insert(agentSkillBindings).values({
        ...source,
        id: randomUUID(),
        agentVersionId: versionMap.get(source.agentVersionId)!,
        skillId: skillMap.get(source.skillId)!,
        createdAt: new Date(),
      });
    for (const source of delegationBindings) {
      const childAgentId = agentMap.get(source.childAgentId);
      const childVersionId = versionMap.get(source.childAgentVersionId);
      if (childAgentId && childVersionId)
        await tx.insert(agentDelegationBindings).values({
          ...source,
          id: randomUUID(),
          agentVersionId: versionMap.get(source.agentVersionId)!,
          childAgentId,
          childAgentVersionId: childVersionId,
          createdAt: new Date(),
        });
    }
  }
  const sourceAgentPreferences = await tx.select().from(userAgentPreferences).where(eq(userAgentPreferences.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceAgentPreferences) {
    await tx
      .insert(userAgentPreferences)
      .values({
        ...source,
        id: randomUUID(),
        workspaceId: input.targetWorkspaceId,
        defaultAgentId: source.defaultAgentId ? (agentMap.get(source.defaultAgentId) ?? null) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  const sourceWorkflows = await tx.select().from(workflows).where(eq(workflows.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceWorkflows) {
    const id = randomUUID();
    workflowMap.set(source.id, id);
    await tx.insert(workflows).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      status: "draft",
      activeVersion: null,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (sourceWorkflows.length > 0) {
    const versions = await tx
      .select()
      .from(workflowVersions)
      .where(
        inArray(
          workflowVersions.workflowId,
          sourceWorkflows.map(({ id }) => id),
        ),
      );
    for (const source of versions) {
      await tx.insert(workflowVersions).values({
        ...source,
        id: randomUUID(),
        workflowId: workflowMap.get(source.workflowId)!,
        definitionJson: remapDefinition(source.definitionJson, [providerMap, modelMap, mcpMap, mcpToolMap, connectorMap, connectionMap, skillMap, knowledgeMap, customToolMap, agentMap]),
        createdById: input.actorUserId,
        createdAt: new Date(),
      });
    }
  }

  const sourceTasks = await tx.select().from(scheduledTasks).where(eq(scheduledTasks.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceTasks) {
    const agentId = agentMap.get(source.agentId);
    if (!agentId) continue;
    const id = randomUUID();
    scheduledTaskMap.set(source.id, id);
    await tx.insert(scheduledTasks).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      agentId,
      conversationId: null,
      enabled: false,
      lastRunAt: null,
      lastStatus: "idle",
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const sourceCustomRoles = await tx
    .select()
    .from(roles)
    .where(and(eq(roles.isSystem, false), eq(roles.ownerResourceType, "workspace"), eq(roles.ownerResourceId, input.sourceWorkspaceId)));
  for (const source of sourceCustomRoles) {
    const id = randomUUID();
    roleMap.set(source.id, id);
    await tx.insert(roles).values({
      ...source,
      id,
      ownerResourceId: input.targetWorkspaceId,
      name: `${source.name}-${suffix}`,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const resourceMaps = new Map([
    ["workspace", new Map([[input.sourceWorkspaceId, input.targetWorkspaceId]])],
    ["agent", agentMap],
    ["provider", providerMap],
    ["model", modelMap],
    ["mcp_server", mcpMap],
    ["tool_connector", connectorMap],
    ["tool_connection", connectionMap],
    ["custom_tool", customToolMap],
    ["knowledge_base", knowledgeMap],
    ["skill", skillMap],
    ["workflow", workflowMap],
    ["scheduled_task", scheduledTaskMap],
  ]);
  const sourceBindings = await tx.select().from(roleBindings).where(eq(roleBindings.resourceId, input.sourceWorkspaceId));
  const resourceBindings = await tx
    .select()
    .from(roleBindings)
    .where(inArray(roleBindings.resourceId, [...agentMap.keys(), ...providerMap.keys(), ...modelMap.keys(), ...mcpMap.keys(), ...connectorMap.keys(), ...connectionMap.keys(), ...customToolMap.keys(), ...knowledgeMap.keys(), ...skillMap.keys(), ...workflowMap.keys(), ...scheduledTaskMap.keys()]));
  for (const source of [...sourceBindings, ...resourceBindings]) {
    const principalId = source.principalType === "user" ? source.principalId : source.principalType === "group" ? (input.groupPrincipalMap?.get(source.principalId) ?? (input.preserveGroupPrincipals ? source.principalId : null)) : null;
    if (!principalId) continue;
    const mappedResourceId = resourceMaps.get(source.resourceType)?.get(source.resourceId);
    if (!mappedResourceId) continue;
    await tx
      .insert(roleBindings)
      .values({
        ...source,
        id: randomUUID(),
        principalId,
        roleId: roleMap.get(source.roleId) ?? source.roleId,
        resourceId: mappedResourceId,
        createdById: input.actorUserId,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }
  const sourceInstalls = await tx.select().from(marketplaceInstalls).where(eq(marketplaceInstalls.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceInstalls) {
    const mappedResourceId = source.installedResourceType ? resourceMaps.get(source.installedResourceType)?.get(source.installedResourceId ?? "") : null;
    if (source.installedResourceId && !mappedResourceId) continue;
    await tx.insert(marketplaceInstalls).values({
      ...source,
      id: randomUUID(),
      workspaceId: input.targetWorkspaceId,
      installedResourceId: mappedResourceId ?? null,
      installedByUserId: input.actorUserId,
      createdAt: new Date(),
    });
  }

  const sourceMembers = await tx
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, input.sourceWorkspaceId), eq(workspaceMembers.status, "active")));
  const memberRole = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.isSystem, true), eq(roles.name, "workspace.member")))
    .limit(1);
  for (const source of sourceMembers) {
    await tx
      .insert(organizationMembers)
      .values({
        organizationId: input.targetOrganizationId,
        userId: source.userId,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [organizationMembers.organizationId, organizationMembers.userId],
        set: { status: "active", updatedAt: new Date() },
      });
    await tx
      .insert(workspaceMembers)
      .values({
        workspaceId: input.targetWorkspaceId,
        userId: source.userId,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { status: "active", updatedAt: new Date() },
      });
    if (memberRole[0])
      await tx
        .insert(roleBindings)
        .values({
          principalType: "user",
          principalId: source.userId,
          roleId: memberRole[0].id,
          resourceType: "workspace",
          resourceId: input.targetWorkspaceId,
          createdById: input.actorUserId,
        })
        .onConflictDoNothing();
  }
}
