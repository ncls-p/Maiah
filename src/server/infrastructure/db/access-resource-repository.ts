import { and, asc, eq, ilike, inArray, isNull, or } from "drizzle-orm";

import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import {
  agentSkills,
  agents,
  aiModels,
  aiProviders,
  conversations,
  customTools,
  knowledgeBases,
  marketplaceItems,
  mcpServers,
  roleBindings,
  scheduledTasks,
  teamMembers,
  toolConnections,
  toolConnectors,
  workflows,
  workspaces,
} from "@/server/infrastructure/db/schema";

export type AccessResourceScope = {
  id: string;
  type: AccessResourceType;
  name: string;
  workspaceId: string;
  organizationId: string;
  parent?: { type: AccessResourceType; id: string };
};

type ResourceRow = Omit<AccessResourceScope, "type" | "organizationId">;

async function withOrganization(
  type: AccessResourceType,
  row: ResourceRow | undefined,
): Promise<AccessResourceScope | null> {
  if (!row) return null;
  const [workspace] = await db
    .select({ organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, row.workspaceId))
    .limit(1);
  if (!workspace) return null;
  return { ...row, type, organizationId: workspace.organizationId };
}

export async function findAccessResource(
  type: AccessResourceType,
  resourceId: string,
): Promise<AccessResourceScope | null> {
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
        .where(
          and(eq(aiProviders.id, resourceId), isNull(aiProviders.archivedAt)),
        )
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
        .where(
          and(eq(mcpServers.id, resourceId), isNull(mcpServers.archivedAt)),
        )
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
        .where(
          and(
            eq(toolConnectors.id, resourceId),
            isNull(toolConnectors.archivedAt),
          ),
        )
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
        .where(
          and(
            eq(toolConnections.id, resourceId),
            isNull(toolConnections.archivedAt),
          ),
        )
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
        .where(
          and(eq(customTools.id, resourceId), isNull(customTools.archivedAt)),
        )
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
        .where(
          and(
            eq(knowledgeBases.id, resourceId),
            isNull(knowledgeBases.archivedAt),
          ),
        )
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
        .where(
          and(eq(agentSkills.id, resourceId), isNull(agentSkills.archivedAt)),
        )
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
        .where(
          and(
            eq(conversations.id, resourceId),
            isNull(conversations.archivedAt),
          ),
        )
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
        .where(eq(marketplaceItems.id, resourceId))
        .limit(1)
        .then((rows) =>
          rows.flatMap((item) =>
            item.workspaceId
              ? [{ ...item, workspaceId: item.workspaceId }]
              : [],
          ),
        );
      break;
  }

  return withOrganization(type, row);
}

export async function listDirectlyBoundResourceIds(
  userId: string,
  type: AccessResourceType,
) {
  const teamRows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId));
  const teamIds = teamRows.map(({ teamId }) => teamId);
  const principalCondition = teamIds.length
    ? or(
        and(
          eq(roleBindings.principalType, "user"),
          eq(roleBindings.principalId, userId),
        ),
        and(
          eq(roleBindings.principalType, "group"),
          inArray(roleBindings.principalId, teamIds),
        ),
      )
    : and(
        eq(roleBindings.principalType, "user"),
        eq(roleBindings.principalId, userId),
      );

  return db
    .selectDistinct({ resourceId: roleBindings.resourceId })
    .from(roleBindings)
    .where(and(eq(roleBindings.resourceType, type), principalCondition))
    .then((rows) => rows.map(({ resourceId }) => resourceId));
}

export async function listAccessResources(input: {
  workspaceId: string;
  type: AccessResourceType;
  search?: string;
  offset?: number;
  limit?: number;
}) {
  const search = input.search?.trim();
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(100, Math.max(1, input.limit ?? 30));
  const nameFilter = (column: Parameters<typeof ilike>[0]) =>
    search ? ilike(column, `%${search}%`) : undefined;
  let rows: Array<{ id: string; name: string }> = [];

  switch (input.type) {
    case "agent":
      rows = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(
          and(
            eq(agents.workspaceId, input.workspaceId),
            isNull(agents.archivedAt),
            nameFilter(agents.name),
          ),
        )
        .orderBy(asc(agents.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "provider":
      rows = await db
        .select({ id: aiProviders.id, name: aiProviders.name })
        .from(aiProviders)
        .where(
          and(
            eq(aiProviders.workspaceId, input.workspaceId),
            isNull(aiProviders.archivedAt),
            nameFilter(aiProviders.name),
          ),
        )
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
        .where(
          and(
            eq(aiProviders.workspaceId, input.workspaceId),
            isNull(aiProviders.archivedAt),
            search ? ilike(aiModels.displayName, `%${search}%`) : undefined,
          ),
        )
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
        .where(
          and(
            eq(mcpServers.workspaceId, input.workspaceId),
            isNull(mcpServers.archivedAt),
            nameFilter(mcpServers.name),
          ),
        )
        .orderBy(asc(mcpServers.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "tool_connector":
      rows = await db
        .select({ id: toolConnectors.id, name: toolConnectors.name })
        .from(toolConnectors)
        .where(
          and(
            eq(toolConnectors.workspaceId, input.workspaceId),
            isNull(toolConnectors.archivedAt),
            nameFilter(toolConnectors.name),
          ),
        )
        .orderBy(asc(toolConnectors.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "tool_connection":
      rows = await db
        .select({ id: toolConnections.id, name: toolConnections.label })
        .from(toolConnections)
        .where(
          and(
            eq(toolConnections.workspaceId, input.workspaceId),
            isNull(toolConnections.archivedAt),
            nameFilter(toolConnections.label),
          ),
        )
        .orderBy(asc(toolConnections.label))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "custom_tool":
      rows = await db
        .select({ id: customTools.id, name: customTools.name })
        .from(customTools)
        .where(
          and(
            eq(customTools.workspaceId, input.workspaceId),
            isNull(customTools.archivedAt),
            nameFilter(customTools.name),
          ),
        )
        .orderBy(asc(customTools.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "knowledge_base":
      rows = await db
        .select({ id: knowledgeBases.id, name: knowledgeBases.name })
        .from(knowledgeBases)
        .where(
          and(
            eq(knowledgeBases.workspaceId, input.workspaceId),
            isNull(knowledgeBases.archivedAt),
            nameFilter(knowledgeBases.name),
          ),
        )
        .orderBy(asc(knowledgeBases.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "skill":
      rows = await db
        .select({ id: agentSkills.id, name: agentSkills.name })
        .from(agentSkills)
        .where(
          and(
            eq(agentSkills.workspaceId, input.workspaceId),
            isNull(agentSkills.archivedAt),
            nameFilter(agentSkills.name),
          ),
        )
        .orderBy(asc(agentSkills.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "workflow":
      rows = await db
        .select({ id: workflows.id, name: workflows.name })
        .from(workflows)
        .where(
          and(
            eq(workflows.workspaceId, input.workspaceId),
            isNull(workflows.archivedAt),
            nameFilter(workflows.name),
          ),
        )
        .orderBy(asc(workflows.name))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "scheduled_task":
      rows = await db
        .select({ id: scheduledTasks.id, name: scheduledTasks.title })
        .from(scheduledTasks)
        .where(
          and(
            eq(scheduledTasks.workspaceId, input.workspaceId),
            nameFilter(scheduledTasks.title),
          ),
        )
        .orderBy(asc(scheduledTasks.title))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "conversation":
      rows = await db
        .select({ id: conversations.id, name: conversations.title })
        .from(conversations)
        .where(
          and(
            eq(conversations.workspaceId, input.workspaceId),
            isNull(conversations.archivedAt),
            nameFilter(conversations.title),
          ),
        )
        .orderBy(asc(conversations.title))
        .limit(limit + 1)
        .offset(offset);
      break;
    case "marketplace_item":
      rows = await db
        .select({ id: marketplaceItems.id, name: marketplaceItems.name })
        .from(marketplaceItems)
        .where(
          and(
            eq(marketplaceItems.publisherWorkspaceId, input.workspaceId),
            nameFilter(marketplaceItems.name),
          ),
        )
        .orderBy(asc(marketplaceItems.name))
        .limit(limit + 1)
        .offset(offset);
      break;
  }

  return {
    resources: rows
      .slice(0, limit)
      .map((row) => ({ ...row, type: input.type })),
    hasMore: rows.length > limit,
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}
