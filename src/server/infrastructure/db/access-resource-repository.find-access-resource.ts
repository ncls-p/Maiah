import { and,eq,isNull,ne } from "drizzle-orm";

import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import { agentSkills,agents,aiModels,aiProviders,conversations,customTools,knowledgeBases,marketplaceItems,mcpServers,scheduledTasks,toolConnections,toolConnectors,workflows } from "@/server/infrastructure/db/schema";
import { AccessResourceScope,ResourceRow,withOrganization } from "./access-resource-repository.access-resource-scope";

export async function findAccessResource(type: AccessResourceType, resourceId: string): Promise<AccessResourceScope | null> {
  let row: ResourceRow | undefined;

  switch (type) {
    case "agent":
      [row] = await db
        .select({
          id: agents.id,
          name: agents.name,
          workspaceId: agents.workspaceId,
        })
        .from(agents)
        .where(and(eq(agents.id, resourceId), isNull(agents.archivedAt)))
        .limit(1);
      break;
    case "provider":
      [row] = await db
        .select({
          id: aiProviders.id,
          name: aiProviders.name,
          workspaceId: aiProviders.workspaceId,
        })
        .from(aiProviders)
        .where(and(eq(aiProviders.id, resourceId), isNull(aiProviders.archivedAt)))
        .limit(1);
      break;
    case "model":
      [row] = await db
        .select({
          id: aiModels.id,
          name: aiModels.displayName,
          fallbackName: aiModels.modelId,
          providerId: aiModels.providerId,
          workspaceId: aiProviders.workspaceId,
        })
        .from(aiModels)
        .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
        .where(and(eq(aiModels.id, resourceId), isNull(aiProviders.archivedAt)))
        .limit(1)
        .then((rows) =>
          rows.map(({ fallbackName, providerId, ...model }) => ({
            ...model,
            name: model.name ?? fallbackName,
            parent: { type: "provider" as const, id: providerId },
          })),
        );
      break;
    case "mcp_server":
      [row] = await db
        .select({
          id: mcpServers.id,
          name: mcpServers.name,
          workspaceId: mcpServers.workspaceId,
        })
        .from(mcpServers)
        .where(and(eq(mcpServers.id, resourceId), isNull(mcpServers.archivedAt)))
        .limit(1);
      break;
    case "tool_connector":
      [row] = await db
        .select({
          id: toolConnectors.id,
          name: toolConnectors.name,
          workspaceId: toolConnectors.workspaceId,
        })
        .from(toolConnectors)
        .where(and(eq(toolConnectors.id, resourceId), isNull(toolConnectors.archivedAt)))
        .limit(1);
      break;
    case "tool_connection":
      [row] = await db
        .select({
          id: toolConnections.id,
          name: toolConnections.label,
          workspaceId: toolConnections.workspaceId,
          connectorId: toolConnections.connectorId,
        })
        .from(toolConnections)
        .where(and(eq(toolConnections.id, resourceId), isNull(toolConnections.archivedAt)))
        .limit(1)
        .then((rows) =>
          rows.map(({ connectorId, ...connection }) => ({
            ...connection,
            parent: { type: "tool_connector" as const, id: connectorId },
          })),
        );
      break;
    case "custom_tool":
      [row] = await db
        .select({
          id: customTools.id,
          name: customTools.name,
          workspaceId: customTools.workspaceId,
        })
        .from(customTools)
        .where(and(eq(customTools.id, resourceId), isNull(customTools.archivedAt)))
        .limit(1);
      break;
    case "knowledge_base":
      [row] = await db
        .select({
          id: knowledgeBases.id,
          name: knowledgeBases.name,
          workspaceId: knowledgeBases.workspaceId,
        })
        .from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, resourceId), isNull(knowledgeBases.archivedAt)))
        .limit(1);
      break;
    case "skill":
      [row] = await db
        .select({
          id: agentSkills.id,
          name: agentSkills.name,
          workspaceId: agentSkills.workspaceId,
        })
        .from(agentSkills)
        .where(and(eq(agentSkills.id, resourceId), isNull(agentSkills.archivedAt)))
        .limit(1);
      break;
    case "workflow":
      [row] = await db
        .select({
          id: workflows.id,
          name: workflows.name,
          workspaceId: workflows.workspaceId,
        })
        .from(workflows)
        .where(and(eq(workflows.id, resourceId), isNull(workflows.archivedAt)))
        .limit(1);
      break;
    case "scheduled_task":
      [row] = await db
        .select({
          id: scheduledTasks.id,
          name: scheduledTasks.title,
          workspaceId: scheduledTasks.workspaceId,
        })
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, resourceId))
        .limit(1);
      break;
    case "conversation":
      [row] = await db
        .select({
          id: conversations.id,
          name: conversations.title,
          workspaceId: conversations.workspaceId,
        })
        .from(conversations)
        .where(and(eq(conversations.id, resourceId), isNull(conversations.archivedAt)))
        .limit(1);
      break;
    case "marketplace_item":
      [row] = await db
        .select({
          id: marketplaceItems.id,
          name: marketplaceItems.name,
          workspaceId: marketplaceItems.publisherWorkspaceId,
        })
        .from(marketplaceItems)
        .where(and(eq(marketplaceItems.id, resourceId), ne(marketplaceItems.status, "archived")))
        .limit(1)
        .then((rows) => rows.flatMap((item) => (item.workspaceId ? [{ ...item, workspaceId: item.workspaceId }] : [])));
      break;
  }

  return withOrganization(type, row);
}
