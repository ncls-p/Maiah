import { usageBillingWorkspace } from "@/modules/usage/billing-scope";
import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import {
  auditEvents,
  teamMembers,
  teams,
  usageEvents,
  workspaces,
} from "@/server/infrastructure/db/schema";
import type { AnalyticsQuery } from "./query";

// Usage follows project ownership. Audit preserves its explicitly recorded organization.
export const auditOrganization = sql<string>`coalesce(${auditEvents.organizationId}, ${workspaces.organizationId})`;
export function analyticsFilters(
  query: AnalyticsQuery,
  kind: "usage" | "audit",
  facets = false,
): SQL {
  const table = kind === "usage" ? usageEvents : auditEvents;
  const org = sql<string>`${kind === "usage" ? workspaces.organizationId : auditOrganization}`;
  const workspace = sql<string>`${kind === "usage" ? usageBillingWorkspace : auditEvents.workspaceId}`;
  const actor =
    kind === "usage" ? usageEvents.userId : auditEvents.actorPrincipalId;
  const filters: SQL[] = [];
  if (query.scope === "organization") filters.push(eq(org, query.scopeId!));
  if (query.scope === "workspace") filters.push(eq(workspace, query.scopeId!));
  if (query.from) filters.push(gte(table.createdAt, new Date(query.from)));
  if (query.to) filters.push(lte(table.createdAt, new Date(query.to)));
  if (facets) return and(...filters) ?? sql`true`;
  if (query.organizationIds?.length)
    filters.push(inArray(org, query.organizationIds));
  if (query.workspaceIds?.length)
    filters.push(inArray(workspace, query.workspaceIds));
  if (query.userIds?.length) filters.push(inArray(actor, query.userIds));
  // EXISTS avoids double-counting users belonging to several selected teams.
  if (query.teamIds?.length)
    filters.push(
      sql`exists (select 1 from ${teamMembers} join ${teams} on ${teams.id} = ${teamMembers.teamId} where ${teamMembers.userId} = ${actor} and ${teams.organizationId} = ${org} and ${inArray(teams.id, query.teamIds)})`,
    );
  if (kind === "usage") {
    for (const [column, ids] of [
      [usageEvents.providerId, query.providerIds],
      [usageEvents.modelId, query.modelIds],
      [usageEvents.agentId, query.agentIds],
    ] as const)
      if (ids?.length) filters.push(inArray(column, ids));
    if (query.operation)
      filters.push(eq(usageEvents.operation, query.operation));
    if (query.status) filters.push(eq(usageEvents.status, query.status));
    if (query.conversationId)
      filters.push(eq(usageEvents.conversationId, query.conversationId));
  } else {
    if (query.action) filters.push(eq(auditEvents.action, query.action));
    if (query.outcome) filters.push(eq(auditEvents.outcome, query.outcome));
    if (query.resourceType)
      filters.push(eq(auditEvents.resourceType, query.resourceType));
    if (query.resourceId)
      filters.push(eq(auditEvents.resourceId, query.resourceId));
  }
  return and(...filters) ?? sql`true`;
}
