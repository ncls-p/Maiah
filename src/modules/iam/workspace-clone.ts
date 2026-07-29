import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agentDelegationBindings,
  agentKnowledgeBindings,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  agents,
  agentVersions,
  aiModels,
  aiProviders,
  customTools,
  documentChunks,
  documentEmbeddings,
  documents,
  knowledgeBases,
  marketplaceInstalls,
  mcpServers,
  mcpTools,
  organizationMembers,
  organizations,
  roleBindings,
  roles,
  scheduledTasks,
  toolConnectionRequirements,
  toolConnections,
  toolConnectors,
  userAgentPreferences,
  userToolSettings,
  workflowVersions,
  workflows,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";

import { IamOperationError } from "./use-cases";
import type { TransferSecretPolicy } from "./resource-transfer";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type WorkspaceCloneCounts = {
  providers: number;
  models: number;
  assistants: number;
  mcpServers: number;
  connections: number;
  skills: number;
  knowledgeBases: number;
  documents: number;
  tools: number;
  workflows: number;
  scheduledTasks: number;
  members: number;
};

async function requireClonePermission(userId: string, workspaceId: string) {
  const result = await authorization.checkPermission(
    { principalType: "user", principalId: userId },
    "roles.manage",
    "workspace",
    workspaceId,
  );
  if (!result.granted) {
    throw new IamOperationError(
      "You need project access administration rights on both projects",
      403,
    );
  }
}

async function workspaceScope(workspaceId: string) {
  const [scope] = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      organizationId: organizations.id,
      organizationName: organizations.name,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!scope) throw new IamOperationError("Project not found", 404);
  return scope;
}

export async function previewWorkspaceClone(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  secretPolicy: TransferSecretPolicy;
}) {
  if (input.sourceWorkspaceId === input.targetWorkspaceId) {
    throw new IamOperationError("Choose another project", 400);
  }
  await Promise.all([
    requireClonePermission(input.actorUserId, input.sourceWorkspaceId),
    requireClonePermission(input.actorUserId, input.targetWorkspaceId),
  ]);
  const [source, destination] = await Promise.all([
    workspaceScope(input.sourceWorkspaceId),
    workspaceScope(input.targetWorkspaceId),
  ]);
  const [
    providerRows,
    modelRows,
    agentRows,
    mcpRows,
    connectionRows,
    skillRows,
    knowledgeRows,
    documentRows,
    toolRows,
    workflowRows,
    scheduledRows,
    memberRows,
  ] = await Promise.all([
    db
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(eq(aiProviders.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: aiModels.id })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
      .where(eq(aiProviders.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(eq(mcpServers.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: toolConnections.id })
      .from(toolConnections)
      .where(eq(toolConnections.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: agentSkills.id })
      .from(agentSkills)
      .where(eq(agentSkills.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: customTools.id })
      .from(customTools)
      .where(eq(customTools.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: scheduledTasks.id })
      .from(scheduledTasks)
      .where(eq(scheduledTasks.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.sourceWorkspaceId),
          eq(workspaceMembers.status, "active"),
        ),
      ),
  ]);
  const counts: WorkspaceCloneCounts = {
    providers: providerRows.length,
    models: modelRows.length,
    assistants: agentRows.length,
    mcpServers: mcpRows.length,
    connections: connectionRows.length,
    skills: skillRows.length,
    knowledgeBases: knowledgeRows.length,
    documents: documentRows.length,
    tools: toolRows.length,
    workflows: workflowRows.length,
    scheduledTasks: scheduledRows.length,
    members: memberRows.length,
  };
  return {
    source,
    destination,
    counts,
    warnings: [
      "Chats, execution history, audit logs, API keys, and pending requests stay in the source project.",
      "Marketplace publications stay with their publisher; installations are reproduced against the cloned resources.",
      input.secretPolicy === "keep"
        ? "Encrypted provider, MCP, and connection secrets will be copied."
        : "Cloned providers, MCP servers, tools, and connections will be disabled until their secrets are configured.",
      "Scheduled tasks are cloned disabled to prevent duplicate executions.",
    ],
    confirmationToken: createHash("sha256")
      .update(
        JSON.stringify({
          sourceWorkspaceId: input.sourceWorkspaceId,
          targetWorkspaceId: input.targetWorkspaceId,
          secretPolicy: input.secretPolicy,
          counts,
        }),
      )
      .digest("hex"),
  };
}

function remapDefinition(value: unknown, mappings: Map<string, string>[]) {
  let serialized = JSON.stringify(value);
  for (const mapping of mappings) {
    for (const [from, to] of mapping) {
      serialized = serialized.replaceAll(from, to);
    }
  }
  return JSON.parse(serialized) as unknown;
}

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
  let pendingRequirements: (typeof toolConnectionRequirements.$inferSelect)[] =
    [];

  const sourceProviders = await tx
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.workspaceId, input.sourceWorkspaceId));
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

  const sourceMcpServers = await tx
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.workspaceId, input.sourceWorkspaceId));
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

  const sourceConnectors = await tx
    .select()
    .from(toolConnectors)
    .where(eq(toolConnectors.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceConnectors) {
    const id = randomUUID();
    connectorMap.set(source.id, id);
    await tx.insert(toolConnectors).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      key: `${source.key}-${suffix}`,
      mcpServerId: source.mcpServerId
        ? (mcpMap.get(source.mcpServerId) ?? null)
        : null,
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
      .where(
        and(
          eq(toolConnections.workspaceId, input.sourceWorkspaceId),
          inArray(toolConnections.connectorId, connectorIds),
        ),
      );
    for (const source of sourceConnections) {
      const id = randomUUID();
      connectionMap.set(source.id, id);
      await tx.insert(toolConnections).values({
        ...source,
        id,
        workspaceId: input.targetWorkspaceId,
        connectorId: connectorMap.get(source.connectorId)!,
        encryptedSecretsJson: disableSecrets
          ? null
          : source.encryptedSecretsJson,
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
      .where(
        and(
          eq(toolConnectionRequirements.workspaceId, input.sourceWorkspaceId),
          inArray(toolConnectionRequirements.connectorId, connectorIds),
        ),
      );
  }

  const sourceSkills = await tx
    .select()
    .from(agentSkills)
    .where(eq(agentSkills.workspaceId, input.sourceWorkspaceId));
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

  const sourceKnowledge = await tx
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.workspaceId, input.sourceWorkspaceId));
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
        const [embedding] = await tx
          .select()
          .from(documentEmbeddings)
          .where(eq(documentEmbeddings.chunkId, source.id))
          .limit(1);
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

  const sourceCustomTools = await tx
    .select()
    .from(customTools)
    .where(eq(customTools.workspaceId, input.sourceWorkspaceId));
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
      toolId:
        mcpToolMap.get(source.toolId) ??
        customToolMap.get(source.toolId) ??
        source.toolId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const sourceToolSettings = await tx
    .select()
    .from(userToolSettings)
    .where(eq(userToolSettings.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceToolSettings) {
    await tx
      .insert(userToolSettings)
      .values({
        ...source,
        id: randomUUID(),
        workspaceId: input.targetWorkspaceId,
        toolId:
          mcpToolMap.get(source.toolId) ??
          customToolMap.get(source.toolId) ??
          source.toolId,
        connectionId: source.connectionId
          ? (connectionMap.get(source.connectionId) ?? null)
          : null,
        encryptedSecretsJson: disableSecrets
          ? null
          : source.encryptedSecretsJson,
        enabled: disableSecrets ? false : source.enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  const sourceAgents = await tx
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, input.sourceWorkspaceId));
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
        providerId: source.providerId
          ? (providerMap.get(source.providerId) ?? null)
          : null,
        modelId: source.modelId ? (modelMap.get(source.modelId) ?? null) : null,
        createdById: input.actorUserId,
        createdAt: new Date(),
      });
    }
    for (const source of sourceAgents) {
      await tx
        .update(agents)
        .set({
          activeVersionId: source.activeVersionId
            ? (versionMap.get(source.activeVersionId) ?? null)
            : null,
        })
        .where(eq(agents.id, agentMap.get(source.id)!));
    }
    const versionIds = sourceVersions.map(({ id }) => id);
    const [toolBindings, knowledgeBindings, skillBindings, delegationBindings] =
      await Promise.all([
        tx
          .select()
          .from(agentToolBindings)
          .where(inArray(agentToolBindings.agentVersionId, versionIds)),
        tx
          .select()
          .from(agentKnowledgeBindings)
          .where(inArray(agentKnowledgeBindings.agentVersionId, versionIds)),
        tx
          .select()
          .from(agentSkillBindings)
          .where(inArray(agentSkillBindings.agentVersionId, versionIds)),
        tx
          .select()
          .from(agentDelegationBindings)
          .where(inArray(agentDelegationBindings.agentVersionId, versionIds)),
      ]);
    for (const source of toolBindings) {
      const mappedToolId =
        source.toolSource === "mcp"
          ? mcpToolMap.get(source.toolId)
          : source.toolSource === "custom"
            ? customToolMap.get(source.toolId)
            : source.toolId;
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
  const sourceAgentPreferences = await tx
    .select()
    .from(userAgentPreferences)
    .where(eq(userAgentPreferences.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceAgentPreferences) {
    await tx
      .insert(userAgentPreferences)
      .values({
        ...source,
        id: randomUUID(),
        workspaceId: input.targetWorkspaceId,
        defaultAgentId: source.defaultAgentId
          ? (agentMap.get(source.defaultAgentId) ?? null)
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  const sourceWorkflows = await tx
    .select()
    .from(workflows)
    .where(eq(workflows.workspaceId, input.sourceWorkspaceId));
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
        definitionJson: remapDefinition(source.definitionJson, [
          providerMap,
          modelMap,
          mcpMap,
          mcpToolMap,
          connectorMap,
          connectionMap,
          skillMap,
          knowledgeMap,
          customToolMap,
          agentMap,
        ]),
        createdById: input.actorUserId,
        createdAt: new Date(),
      });
    }
  }

  const sourceTasks = await tx
    .select()
    .from(scheduledTasks)
    .where(eq(scheduledTasks.workspaceId, input.sourceWorkspaceId));
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
    .where(
      and(
        eq(roles.isSystem, false),
        eq(roles.ownerResourceType, "workspace"),
        eq(roles.ownerResourceId, input.sourceWorkspaceId),
      ),
    );
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
    [
      "workspace",
      new Map([[input.sourceWorkspaceId, input.targetWorkspaceId]]),
    ],
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
  const sourceBindings = await tx
    .select()
    .from(roleBindings)
    .where(eq(roleBindings.resourceId, input.sourceWorkspaceId));
  const resourceBindings = await tx
    .select()
    .from(roleBindings)
    .where(
      inArray(roleBindings.resourceId, [
        ...agentMap.keys(),
        ...providerMap.keys(),
        ...modelMap.keys(),
        ...mcpMap.keys(),
        ...connectorMap.keys(),
        ...connectionMap.keys(),
        ...customToolMap.keys(),
        ...knowledgeMap.keys(),
        ...skillMap.keys(),
        ...workflowMap.keys(),
        ...scheduledTaskMap.keys(),
      ]),
    );
  for (const source of [...sourceBindings, ...resourceBindings]) {
    const principalId =
      source.principalType === "user"
        ? source.principalId
        : source.principalType === "group"
          ? (input.groupPrincipalMap?.get(source.principalId) ??
            (input.preserveGroupPrincipals ? source.principalId : null))
          : null;
    if (!principalId) continue;
    const mappedResourceId = resourceMaps
      .get(source.resourceType)
      ?.get(source.resourceId);
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
  const sourceInstalls = await tx
    .select()
    .from(marketplaceInstalls)
    .where(eq(marketplaceInstalls.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceInstalls) {
    const mappedResourceId = source.installedResourceType
      ? resourceMaps
          .get(source.installedResourceType)
          ?.get(source.installedResourceId ?? "")
      : null;
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
    .where(
      and(
        eq(workspaceMembers.workspaceId, input.sourceWorkspaceId),
        eq(workspaceMembers.status, "active"),
      ),
    );
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
        target: [
          organizationMembers.organizationId,
          organizationMembers.userId,
        ],
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

export async function executeWorkspaceClone(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  secretPolicy: TransferSecretPolicy;
  confirmationToken: string;
}) {
  const preview = await previewWorkspaceClone(input);
  if (preview.confirmationToken !== input.confirmationToken) {
    throw new IamOperationError(
      "The clone changed. Review it again before confirming.",
      409,
    );
  }
  await db.transaction((tx) =>
    cloneWorkspaceConfiguration(tx, {
      ...input,
      targetOrganizationId: preview.destination.organizationId,
      preserveGroupPrincipals:
        preview.source.organizationId === preview.destination.organizationId,
    }),
  );
  await audit.emit({
    organizationId: preview.destination.organizationId,
    workspaceId: input.targetWorkspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "workspace.cloned",
    resourceType: "workspace",
    resourceId: input.targetWorkspaceId,
    outcome: "success",
    metadata: {
      sourceWorkspaceId: input.sourceWorkspaceId,
      counts: preview.counts,
      secretPolicy: input.secretPolicy,
    },
  });
  return { cloned: preview.counts, destination: preview.destination };
}
