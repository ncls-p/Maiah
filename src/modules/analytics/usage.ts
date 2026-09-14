import { usageBillingWorkspace } from "@/modules/usage/billing-scope";
import {
  getWorkspaceMonthlyTokenLimit,
  getWorkspaceMonthlyTokenUsage,
} from "@/modules/usage/quota";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  aiModels,
  aiProviders,
  organizations,
  usageEvents,
  users,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { analyticsFilters } from "./filters";
import { getAnalyticsFacets } from "./facets";
import type { AnalyticsQuery } from "./query";
import {
  combineMetricRows,
  metricColumns,
  usageCost,
  usageCurrency,
} from "./usage-metrics";

export async function getUsageAnalytics(query: AnalyticsQuery) {
  const dimensions = {
    provider: { id: usageEvents.providerId, name: aiProviders.name },
    model: {
      id: usageEvents.modelId,
      name: sql<string>`coalesce(${aiModels.displayName}, ${aiModels.modelId}) || ' · ' || coalesce(${aiProviders.name}, '')`,
    },
    organization: { id: workspaces.organizationId, name: organizations.name },
    workspace: { id: usageBillingWorkspace, name: workspaces.name },
    user: { id: usageEvents.userId, name: users.name },
    agent: { id: usageEvents.agentId, name: agents.name },
    operation: { id: usageEvents.operation, name: usageEvents.operation },
  };
  const dimension = dimensions[query.groupBy];
  const where = analyticsFilters(query, "usage");
  const bucket = { day: sql`'day'`, week: sql`'week'`, month: sql`'month'` }[
    query.bucket
  ];
  const date = sql<string>`to_char(date_trunc(${bucket}, ${usageEvents.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
  const aggregate = () =>
    db
      .select({ ...dimension, currency: usageCurrency, ...metricColumns })
      .from(usageEvents)
      .leftJoin(workspaces, eq(workspaces.id, usageBillingWorkspace))
      .leftJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .leftJoin(users, eq(usageEvents.userId, users.id))
      .leftJoin(aiProviders, eq(usageEvents.providerId, aiProviders.id))
      .leftJoin(aiModels, eq(usageEvents.modelId, aiModels.id))
      .leftJoin(agents, eq(usageEvents.agentId, agents.id));
  const [rows, daily, totalRows, events, facets] = await Promise.all([
    aggregate()
      .where(where)
      .groupBy(dimension.id, dimension.name, usageCurrency),
    db
      .select({ ...dimension, date, currency: usageCurrency, ...metricColumns })
      .from(usageEvents)
      .leftJoin(workspaces, eq(workspaces.id, usageBillingWorkspace))
      .leftJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .leftJoin(users, eq(usageEvents.userId, users.id))
      .leftJoin(aiProviders, eq(usageEvents.providerId, aiProviders.id))
      .leftJoin(aiModels, eq(usageEvents.modelId, aiModels.id))
      .leftJoin(agents, eq(usageEvents.agentId, agents.id))
      .where(where)
      .groupBy(dimension.id, dimension.name, date, usageCurrency)
      .orderBy(date),
    db
      .select({ currency: usageCurrency, ...metricColumns })
      .from(usageEvents)
      .leftJoin(workspaces, eq(workspaces.id, usageBillingWorkspace))
      .where(where)
      .groupBy(usageCurrency),
    db
      .select({
        id: usageEvents.id,
        createdAt: usageEvents.createdAt,
        operation: usageEvents.operation,
        status: usageEvents.status,
        userName: users.name,
        workspaceName: workspaces.name,
        providerName: aiProviders.name,
        modelName: aiModels.displayName,
        inputTokens: usageEvents.inputTokens,
        outputTokens: usageEvents.outputTokens,
        latencyMs: usageEvents.latencyMs,
        cost: usageCost,
        currency: usageCurrency,
      })
      .from(usageEvents)
      .leftJoin(workspaces, eq(workspaces.id, usageBillingWorkspace))
      .leftJoin(users, eq(usageEvents.userId, users.id))
      .leftJoin(aiProviders, eq(usageEvents.providerId, aiProviders.id))
      .leftJoin(aiModels, eq(usageEvents.modelId, aiModels.id))
      .where(where)
      .orderBy(desc(usageEvents.createdAt), desc(usageEvents.id))
      .limit(query.limit)
      .offset(query.offset),
    getAnalyticsFacets(query, "usage"),
  ]);
  const totals = combineMetricRows(
    totalRows.map((row) => ({ ...row, id: "total", name: "total" })),
  )[0] ?? {
    events: 0,
    inputTokens: 0,
    outputTokens: 0,
    failedEvents: 0,
    averageLatencyMs: 0,
    unpricedEvents: 0,
    costs: [],
  };
  const monthlyLimit =
    query.scope === "workspace" ? getWorkspaceMonthlyTokenLimit() : null;
  const monthlyUsed = monthlyLimit
    ? await getWorkspaceMonthlyTokenUsage(query.scopeId!)
    : 0;
  return {
    period: {
      from: query.from ?? null,
      to: query.to ?? null,
      bucket: query.bucket,
    },
    quota: monthlyLimit
      ? {
          limit: monthlyLimit,
          used: monthlyUsed,
          remaining: Math.max(0, monthlyLimit - monthlyUsed),
        }
      : null,
    totals,
    groups: combineMetricRows(rows).sort(
      (a, b) => b.inputTokens + b.outputTokens - a.inputTokens - a.outputTokens,
    ),
    series: combineMetricRows(daily),
    events,
    facets,
    offset: query.offset,
    limit: query.limit,
  };
}
