import { and,asc,eq,ilike,isNull,ne } from "drizzle-orm";

import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import { agentSkills,agents,aiModels,aiProviders,conversations,customTools,knowledgeBases,marketplaceItems,mcpServers,scheduledTasks,toolConnections,toolConnectors,workflows } from "@/server/infrastructure/db/schema";

export async function listAccessResources(input: { workspaceId: string; type: AccessResourceType; search?: string; offset?: number; limit?: number }) {
  const search = input.search?.trim();
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(100, Math.max(1, input.limit ?? 30));
  const nameFilter = (column: Parameters<typeof ilike>[0]) => (search ? ilike(column, `%${search}%`) : undefined);
  let rows: Array<{ id: string; name: string }> = [];

  switch (input.type) {
    case "agent":
      rows = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(and(eq(agents.workspaceId, input.workspaceId), isNull(agents.archivedAt), nameFilter(agents.name)))
        .orderBy(asc(agents.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "provider":
      rows = await db
        .select({ id: aiProviders.id, name: aiProviders.name })
        .from(aiProviders)
        .where(and(eq(aiProviders.workspaceId, input.workspaceId), isNull(aiProviders.archivedAt), nameFilter(aiProviders.name)))
        .orderBy(asc(aiProviders.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "model":
      rows = await db
        .select({
          id: aiModels.id,
          name: aiModels.displayName,
          fallbackName: aiModels.modelId,
        })
        .from(aiModels)
        .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
        .where(and(eq(aiProviders.workspaceId, input.workspaceId), isNull(aiProviders.archivedAt), search ? ilike(aiModels.displayName, `%${search}%`) : undefined))
        .orderBy(asc(aiModels.displayName), asc(aiModels.modelId))
        .limit(limit + 1)
        .offset(offset)
        .then((models) =>
          models.map(({ fallbackName, ...model }) => ({
            ...model,
            name: model.name ?? fallbackName,
          })),
        );
      break;
    case "mcp_server":
      rows = await db
        .select({ id: mcpServers.id, name: mcpServers.name })
        .from(mcpServers)
        .where(and(eq(mcpServers.workspaceId, input.workspaceId), isNull(mcpServers.archivedAt), nameFilter(mcpServers.name)))
        .orderBy(asc(mcpServers.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "tool_connector":
      rows = await db
        .select({ id: toolConnectors.id, name: toolConnectors.name })
        .from(toolConnectors)
        .where(and(eq(toolConnectors.workspaceId, input.workspaceId), isNull(toolConnectors.archivedAt), nameFilter(toolConnectors.name)))
        .orderBy(asc(toolConnectors.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "tool_connection":
      rows = await db
        .select({ id: toolConnections.id, name: toolConnections.label })
        .from(toolConnections)
        .where(and(eq(toolConnections.workspaceId, input.workspaceId), isNull(toolConnections.archivedAt), nameFilter(toolConnections.label)))
        .orderBy(asc(toolConnections.label))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "custom_tool":
      rows = await db
        .select({ id: customTools.id, name: customTools.name })
        .from(customTools)
        .where(and(eq(customTools.workspaceId, input.workspaceId), isNull(customTools.archivedAt), nameFilter(customTools.name)))
        .orderBy(asc(customTools.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "knowledge_base":
      rows = await db
        .select({ id: knowledgeBases.id, name: knowledgeBases.name })
        .from(knowledgeBases)
        .where(and(eq(knowledgeBases.workspaceId, input.workspaceId), isNull(knowledgeBases.archivedAt), nameFilter(knowledgeBases.name)))
        .orderBy(asc(knowledgeBases.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "skill":
      rows = await db
        .select({ id: agentSkills.id, name: agentSkills.name })
        .from(agentSkills)
        .where(and(eq(agentSkills.workspaceId, input.workspaceId), isNull(agentSkills.archivedAt), nameFilter(agentSkills.name)))
        .orderBy(asc(agentSkills.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "workflow":
      rows = await db
        .select({ id: workflows.id, name: workflows.name })
        .from(workflows)
        .where(and(eq(workflows.workspaceId, input.workspaceId), isNull(workflows.archivedAt), nameFilter(workflows.name)))
        .orderBy(asc(workflows.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "scheduled_task":
      rows = await db
        .select({ id: scheduledTasks.id, name: scheduledTasks.title })
        .from(scheduledTasks)
        .where(and(eq(scheduledTasks.workspaceId, input.workspaceId), nameFilter(scheduledTasks.title)))
        .orderBy(asc(scheduledTasks.title))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "conversation":
      rows = await db
        .select({ id: conversations.id, name: conversations.title })
        .from(conversations)
        .where(and(eq(conversations.workspaceId, input.workspaceId), isNull(conversations.archivedAt), nameFilter(conversations.title)))
        .orderBy(asc(conversations.title))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "marketplace_item":
      rows = await db
        .select({ id: marketplaceItems.id, name: marketplaceItems.name })
        .from(marketplaceItems)
        .where(and(eq(marketplaceItems.publisherWorkspaceId, input.workspaceId), ne(marketplaceItems.status, "archived"), nameFilter(marketplaceItems.name)))
        .orderBy(asc(marketplaceItems.name))
        .limit(limit + 1)
        .offset(offset);
      break;
  }

  return {
    resources: rows.slice(0, limit).map((row) => ({ ...row, type: input.type })),
    hasMore: rows.length > limit,
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}
