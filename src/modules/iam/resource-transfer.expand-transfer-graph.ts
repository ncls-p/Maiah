import { and, eq, inArray } from "drizzle-orm";

import { type AccessResourceType } from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import {
  agentDelegationBindings,
  agentKnowledgeBindings,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  agentVersions,
  agents,
  aiModels,
  aiProviders,
  conversations,
  customTools,
  knowledgeBases,
  marketplaceItems,
  mcpServers,
  mcpTools,
  scheduledTasks,
  toolConnections,
  toolConnectors,
  workflows,
} from "@/server/infrastructure/db/schema";

import {
  ResourceTransferRootType,
  TransferSeed,
  addResource,
  emptyTransferSets,
  ids,
} from "./resource-transfer.transfer-access-policies";
import { IamOperationError } from "./use-cases";

export async function expandTransferGraph(
  sourceWorkspaceId: string,
  root: Omit<TransferSeed, "type"> & { type: ResourceTransferRootType },
) {
  const sets = emptyTransferSets();
  if (root.type === "workspace") {
    const roots = await Promise.all([
      db
        .select({ id: agents.id })
        .from(agents)
        .where(eq(agents.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: aiProviders.id })
        .from(aiProviders)
        .where(eq(aiProviders.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: mcpServers.id })
        .from(mcpServers)
        .where(eq(mcpServers.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: toolConnectors.id })
        .from(toolConnectors)
        .where(eq(toolConnectors.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: toolConnections.id })
        .from(toolConnections)
        .where(eq(toolConnections.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: customTools.id })
        .from(customTools)
        .where(eq(customTools.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: knowledgeBases.id })
        .from(knowledgeBases)
        .where(eq(knowledgeBases.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: agentSkills.id })
        .from(agentSkills)
        .where(eq(agentSkills.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: workflows.id })
        .from(workflows)
        .where(eq(workflows.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: scheduledTasks.id })
        .from(scheduledTasks)
        .where(eq(scheduledTasks.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.workspaceId, sourceWorkspaceId)),
      db
        .select({ id: marketplaceItems.id })
        .from(marketplaceItems)
        .where(eq(marketplaceItems.publisherWorkspaceId, sourceWorkspaceId)),
    ]);
    const rootTypes: AccessResourceType[] = [
      "agent",
      "provider",
      "mcp_server",
      "tool_connector",
      "tool_connection",
      "custom_tool",
      "knowledge_base",
      "skill",
      "workflow",
      "scheduled_task",
      "conversation",
      "marketplace_item",
    ];
    roots.forEach((rows, index) => {
      const type = rootTypes[index];
      for (const row of rows) addResource(sets, type, row.id, "selected");
    });
  } else {
    addResource(sets, root.type, root.id, "selected");
  }

  for (let iteration = 0; iteration < 20; iteration += 1) {
    let changed = false;
    const agentIds = ids(sets, "agent");
    if (agentIds.length > 0) {
      const versions = await db
        .select({
          id: agentVersions.id,
          providerId: agentVersions.providerId,
          modelId: agentVersions.modelId,
        })
        .from(agentVersions)
        .where(inArray(agentVersions.agentId, agentIds));
      const versionIds = versions.map(({ id }) => id);
      for (const version of versions) {
        changed =
          addResource(sets, "provider", version.providerId, "dependency") ||
          changed;
        changed =
          addResource(sets, "model", version.modelId, "dependency") || changed;
      }
      if (versionIds.length > 0) {
        const [knowledge, skills, delegations, tools] = await Promise.all([
          db
            .select({ id: agentKnowledgeBindings.knowledgeBaseId })
            .from(agentKnowledgeBindings)
            .where(inArray(agentKnowledgeBindings.agentVersionId, versionIds)),
          db
            .select({ id: agentSkillBindings.skillId })
            .from(agentSkillBindings)
            .where(inArray(agentSkillBindings.agentVersionId, versionIds)),
          db
            .select({ id: agentDelegationBindings.childAgentId })
            .from(agentDelegationBindings)
            .where(inArray(agentDelegationBindings.agentVersionId, versionIds)),
          db
            .select({
              source: agentToolBindings.toolSource,
              id: agentToolBindings.toolId,
            })
            .from(agentToolBindings)
            .where(inArray(agentToolBindings.agentVersionId, versionIds)),
        ]);
        for (const row of knowledge)
          changed =
            addResource(sets, "knowledge_base", row.id, "dependency") ||
            changed;
        for (const row of skills)
          changed = addResource(sets, "skill", row.id, "dependency") || changed;
        for (const row of delegations)
          changed = addResource(sets, "agent", row.id, "dependency") || changed;
        for (const tool of tools) {
          if (tool.source === "custom") {
            changed =
              addResource(sets, "custom_tool", tool.id, "dependency") ||
              changed;
          } else if (tool.source === "mcp") {
            const [mcpTool] = await db
              .select({ serverId: mcpTools.mcpServerId })
              .from(mcpTools)
              .where(eq(mcpTools.id, tool.id))
              .limit(1);
            changed =
              addResource(
                sets,
                "mcp_server",
                mcpTool?.serverId,
                "dependency",
              ) || changed;
          }
        }
      }

      const [history, tasks] = await Promise.all([
        db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.workspaceId, sourceWorkspaceId),
              inArray(conversations.agentId, agentIds),
            ),
          ),
        db
          .select({ id: scheduledTasks.id })
          .from(scheduledTasks)
          .where(
            and(
              eq(scheduledTasks.workspaceId, sourceWorkspaceId),
              inArray(scheduledTasks.agentId, agentIds),
            ),
          ),
      ]);
      for (const row of history)
        changed =
          addResource(sets, "conversation", row.id, "history") || changed;
      for (const row of tasks)
        changed =
          addResource(sets, "scheduled_task", row.id, "dependent") || changed;
    }

    const providerIds = ids(sets, "provider");
    if (providerIds.length > 0) {
      const models = await db
        .select({ id: aiModels.id })
        .from(aiModels)
        .where(inArray(aiModels.providerId, providerIds));
      for (const model of models)
        changed = addResource(sets, "model", model.id, "parent") || changed;
    }

    const modelIds = ids(sets, "model");
    if (modelIds.length > 0) {
      const [modelRows, consumers] = await Promise.all([
        db
          .select({ providerId: aiModels.providerId })
          .from(aiModels)
          .where(inArray(aiModels.id, modelIds)),
        db
          .select({ agentId: agentVersions.agentId })
          .from(agentVersions)
          .where(inArray(agentVersions.modelId, modelIds)),
      ]);
      for (const model of modelRows)
        changed =
          addResource(sets, "provider", model.providerId, "parent") || changed;
      for (const consumer of consumers)
        changed =
          addResource(sets, "agent", consumer.agentId, "dependent") || changed;
    }

    if (providerIds.length > 0) {
      const consumers = await db
        .select({ agentId: agentVersions.agentId })
        .from(agentVersions)
        .where(inArray(agentVersions.providerId, providerIds));
      for (const consumer of consumers)
        changed =
          addResource(sets, "agent", consumer.agentId, "dependent") || changed;
    }

    const mcpServerIds = ids(sets, "mcp_server");
    if (mcpServerIds.length > 0) {
      const [tools, connectors] = await Promise.all([
        db
          .select({ id: mcpTools.id })
          .from(mcpTools)
          .where(inArray(mcpTools.mcpServerId, mcpServerIds)),
        db
          .select({ id: toolConnectors.id })
          .from(toolConnectors)
          .where(inArray(toolConnectors.mcpServerId, mcpServerIds)),
      ]);
      const toolIds = tools.map(({ id }) => id);
      if (toolIds.length > 0) {
        const bindings = await db
          .select({ versionId: agentToolBindings.agentVersionId })
          .from(agentToolBindings)
          .where(
            and(
              eq(agentToolBindings.toolSource, "mcp"),
              inArray(agentToolBindings.toolId, toolIds),
            ),
          );
        const versionIds = bindings.map(({ versionId }) => versionId);
        if (versionIds.length > 0) {
          const consumers = await db
            .select({ id: agentVersions.agentId })
            .from(agentVersions)
            .where(inArray(agentVersions.id, versionIds));
          for (const consumer of consumers)
            changed =
              addResource(sets, "agent", consumer.id, "dependent") || changed;
        }
      }
      for (const connector of connectors)
        changed =
          addResource(sets, "tool_connector", connector.id, "dependent") ||
          changed;
    }

    const connectorIds = ids(sets, "tool_connector");
    if (connectorIds.length > 0) {
      const [connectorRows, connections] = await Promise.all([
        db
          .select({ mcpServerId: toolConnectors.mcpServerId })
          .from(toolConnectors)
          .where(inArray(toolConnectors.id, connectorIds)),
        db
          .select({ id: toolConnections.id })
          .from(toolConnections)
          .where(inArray(toolConnections.connectorId, connectorIds)),
      ]);
      for (const connector of connectorRows)
        changed =
          addResource(
            sets,
            "mcp_server",
            connector.mcpServerId,
            "dependency",
          ) || changed;
      for (const connection of connections)
        changed =
          addResource(sets, "tool_connection", connection.id, "dependent") ||
          changed;
    }

    const connectionIds = ids(sets, "tool_connection");
    if (connectionIds.length > 0) {
      const rows = await db
        .select({ connectorId: toolConnections.connectorId })
        .from(toolConnections)
        .where(inArray(toolConnections.id, connectionIds));
      for (const row of rows)
        changed =
          addResource(sets, "tool_connector", row.connectorId, "parent") ||
          changed;
    }

    const customToolIds = ids(sets, "custom_tool");
    if (customToolIds.length > 0) {
      const bindings = await db
        .select({ versionId: agentToolBindings.agentVersionId })
        .from(agentToolBindings)
        .where(
          and(
            eq(agentToolBindings.toolSource, "custom"),
            inArray(agentToolBindings.toolId, customToolIds),
          ),
        );
      const versionIds = bindings.map(({ versionId }) => versionId);
      if (versionIds.length > 0) {
        const consumers = await db
          .select({ id: agentVersions.agentId })
          .from(agentVersions)
          .where(inArray(agentVersions.id, versionIds));
        for (const consumer of consumers)
          changed =
            addResource(sets, "agent", consumer.id, "dependent") || changed;
      }
    }

    const knowledgeIds = ids(sets, "knowledge_base");
    if (knowledgeIds.length > 0) {
      const bindings = await db
        .select({ versionId: agentKnowledgeBindings.agentVersionId })
        .from(agentKnowledgeBindings)
        .where(inArray(agentKnowledgeBindings.knowledgeBaseId, knowledgeIds));
      const versionIds = bindings.map(({ versionId }) => versionId);
      if (versionIds.length > 0) {
        const consumers = await db
          .select({ id: agentVersions.agentId })
          .from(agentVersions)
          .where(inArray(agentVersions.id, versionIds));
        for (const consumer of consumers)
          changed =
            addResource(sets, "agent", consumer.id, "dependent") || changed;
      }
    }

    const skillIds = ids(sets, "skill");
    if (skillIds.length > 0) {
      const bindings = await db
        .select({ versionId: agentSkillBindings.agentVersionId })
        .from(agentSkillBindings)
        .where(inArray(agentSkillBindings.skillId, skillIds));
      const versionIds = bindings.map(({ versionId }) => versionId);
      if (versionIds.length > 0) {
        const consumers = await db
          .select({ id: agentVersions.agentId })
          .from(agentVersions)
          .where(inArray(agentVersions.id, versionIds));
        for (const consumer of consumers)
          changed =
            addResource(sets, "agent", consumer.id, "dependent") || changed;
      }
    }

    const conversationIds = ids(sets, "conversation");
    if (conversationIds.length > 0) {
      const [rows, tasks] = await Promise.all([
        db
          .select({ agentId: conversations.agentId })
          .from(conversations)
          .where(inArray(conversations.id, conversationIds)),
        db
          .select({ id: scheduledTasks.id })
          .from(scheduledTasks)
          .where(inArray(scheduledTasks.conversationId, conversationIds)),
      ]);
      for (const row of rows)
        changed =
          addResource(sets, "agent", row.agentId, "dependency") || changed;
      for (const task of tasks)
        changed =
          addResource(sets, "scheduled_task", task.id, "dependent") || changed;
    }

    const taskIds = ids(sets, "scheduled_task");
    if (taskIds.length > 0) {
      const rows = await db
        .select({
          agentId: scheduledTasks.agentId,
          conversationId: scheduledTasks.conversationId,
        })
        .from(scheduledTasks)
        .where(inArray(scheduledTasks.id, taskIds));
      for (const row of rows) {
        changed =
          addResource(sets, "agent", row.agentId, "dependency") || changed;
        changed =
          addResource(sets, "conversation", row.conversationId, "dependency") ||
          changed;
      }
    }

    if (!changed) return sets;
  }

  throw new IamOperationError(
    "The resource dependency graph is too deep to transfer safely",
    409,
  );
}
