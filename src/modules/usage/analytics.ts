import { and,desc,eq,gte,lte,sql,type SQL } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import { aiModels,aiProviders,teamMembers,teams,usageEvents,users,workspaces } from "@/server/infrastructure/db/schema";

type UsageAnalyticsInput = {
  workspaceId: string;
  limit: number;
  operation?: string;
  from?: Date;
  to?: Date;
};

const eventCount = sql<string>`count(*)::text`;
const inputTokens = sql<string>`coalesce(sum(${usageEvents.inputTokens}), 0)::text`;
const outputTokens = sql<string>`coalesce(sum(${usageEvents.outputTokens}), 0)::text`;
const failedEvents = sql<string>`count(*) filter (where ${usageEvents.status} in ('failed', 'error', 'failure'))::text`;
const averageLatency = sql<string>`coalesce(avg(${usageEvents.latencyMs}), 0)::text`;
const costValue = sql<string>`coalesce(((${usageEvents.metadataJson}->>'cost')::numeric), (${usageEvents.costUsd})::numeric)`;
const costCurrency = sql<string>`coalesce(${usageEvents.metadataJson}->>'currency', case when ${usageEvents.costUsd} is not null then 'USD' end)`;
const costTotal = sql<string>`coalesce(sum(${costValue}), 0)::text`;

function filtersFor(input: UsageAnalyticsInput): SQL[] {
  const filters: SQL[] = [eq(usageEvents.workspaceId, input.workspaceId)];
  if (input.operation) filters.push(eq(usageEvents.operation, input.operation));
  if (input.from) filters.push(gte(usageEvents.createdAt, input.from));
  if (input.to) filters.push(lte(usageEvents.createdAt, input.to));
  return filters;
}

function number(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metric(row: { events: string; inputTokens: string; outputTokens: string; failedEvents?: string; averageLatencyMs?: string }) {
  return {
    events: number(row.events),
    inputTokens: number(row.inputTokens),
    outputTokens: number(row.outputTokens),
    failedEvents: number(row.failedEvents),
    averageLatencyMs: Math.round(number(row.averageLatencyMs)),
  };
}

type CostRow = { id: string | null; currency: string; cost: string };

function costsById(rows: CostRow[]) {
  const result = new Map<string, Array<{ currency: string; amount: number }>>();
  for (const row of rows) {
    const id = row.id ?? "unknown";
    const costs = result.get(id) ?? [];
    costs.push({ currency: row.currency, amount: number(row.cost) });
    result.set(id, costs);
  }
  return result;
}

function costQueryFilters(filters: SQL[]) {
  return and(...filters, sql`${costValue} is not null`, sql`${costCurrency} is not null`);
}

export async function getWorkspaceUsageAnalytics(input: UsageAnalyticsInput) {
  const filters = filtersFor(input);
  const where = and(...filters);
  const [recentEvents, [totals], daily, userMetrics, teamMetrics, modelMetrics, operationMetrics, globalCosts, userCostRows, teamCostRows, modelCostRows, operationCostRows] = await Promise.all([
    db
      .select({
        id: usageEvents.id,
        operation: usageEvents.operation,
        inputTokens: usageEvents.inputTokens,
        outputTokens: usageEvents.outputTokens,
        costUsd: usageEvents.costUsd,
        metadataJson: usageEvents.metadataJson,
        status: usageEvents.status,
        latencyMs: usageEvents.latencyMs,
        createdAt: usageEvents.createdAt,
        userName: users.name,
        modelName: aiModels.displayName,
        modelId: aiModels.modelId,
        providerName: aiProviders.name,
      })
      .from(usageEvents)
      .leftJoin(users, eq(usageEvents.userId, users.id))
      .leftJoin(aiModels, eq(usageEvents.modelId, aiModels.id))
      .leftJoin(aiProviders, eq(usageEvents.providerId, aiProviders.id))
      .where(where)
      .orderBy(desc(usageEvents.createdAt))
      .limit(input.limit),
    db
      .select({
        events: eventCount,
        inputTokens,
        outputTokens,
        failedEvents,
        averageLatencyMs: averageLatency,
      })
      .from(usageEvents)
      .where(where),
    db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${usageEvents.createdAt}), 'YYYY-MM-DD')`,
        events: eventCount,
        inputTokens,
        outputTokens,
      })
      .from(usageEvents)
      .where(where)
      .groupBy(sql`date_trunc('day', ${usageEvents.createdAt})`)
      .orderBy(sql`date_trunc('day', ${usageEvents.createdAt})`),
    db
      .select({
        id: usageEvents.userId,
        name: users.name,
        email: users.email,
        events: eventCount,
        inputTokens,
        outputTokens,
      })
      .from(usageEvents)
      .leftJoin(users, eq(usageEvents.userId, users.id))
      .where(where)
      .groupBy(usageEvents.userId, users.name, users.email)
      .orderBy(desc(sql`sum(coalesce(${usageEvents.inputTokens}, 0) + coalesce(${usageEvents.outputTokens}, 0))`)),
    db
      .select({
        id: teams.id,
        name: teams.name,
        events: eventCount,
        inputTokens,
        outputTokens,
      })
      .from(usageEvents)
      .innerJoin(teamMembers, eq(usageEvents.userId, teamMembers.userId))
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .innerJoin(workspaces, eq(workspaces.id, input.workspaceId))
      .where(and(...filters, eq(teams.organizationId, workspaces.organizationId)))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(sql`sum(coalesce(${usageEvents.inputTokens}, 0) + coalesce(${usageEvents.outputTokens}, 0))`)),
    db
      .select({
        id: usageEvents.modelId,
        name: aiModels.displayName,
        modelId: aiModels.modelId,
        providerName: aiProviders.name,
        events: eventCount,
        inputTokens,
        outputTokens,
      })
      .from(usageEvents)
      .leftJoin(aiModels, eq(usageEvents.modelId, aiModels.id))
      .leftJoin(aiProviders, eq(usageEvents.providerId, aiProviders.id))
      .where(where)
      .groupBy(usageEvents.modelId, aiModels.displayName, aiModels.modelId, aiProviders.name)
      .orderBy(desc(sql`sum(coalesce(${usageEvents.inputTokens}, 0) + coalesce(${usageEvents.outputTokens}, 0))`)),
    db
      .select({
        operation: usageEvents.operation,
        events: eventCount,
        inputTokens,
        outputTokens,
      })
      .from(usageEvents)
      .where(where)
      .groupBy(usageEvents.operation)
      .orderBy(desc(eventCount)),
    db.select({ currency: costCurrency, cost: costTotal }).from(usageEvents).where(costQueryFilters(filters)).groupBy(costCurrency),
    groupedCosts(filters, usageEvents.userId),
    groupedTeamCosts(input, filters),
    groupedCosts(filters, usageEvents.modelId),
    groupedCosts(filters, usageEvents.operation),
  ]);

  const userCosts = costsById(userCostRows);
  const teamCosts = costsById(teamCostRows);
  const modelCosts = costsById(modelCostRows);
  const operationCosts = costsById(operationCostRows);
  return {
    totals: { ...metric(totals), costs: globalCosts.map(costRow) },
    daily: daily.map((row) => ({ date: row.date, ...metric(row) })),
    users: userMetrics.map((row) => ({
      ...row,
      ...metric(row),
      costs: userCosts.get(row.id ?? "unknown") ?? [],
    })),
    teams: teamMetrics.map((row) => ({
      ...row,
      ...metric(row),
      costs: teamCosts.get(row.id) ?? [],
    })),
    models: modelMetrics.map((row) => ({
      ...row,
      ...metric(row),
      costs: modelCosts.get(row.id ?? "unknown") ?? [],
    })),
    operations: operationMetrics.map((row) => ({
      ...row,
      ...metric(row),
      costs: operationCosts.get(row.operation) ?? [],
    })),
    events: recentEvents,
  };
}

function costRow(row: { currency: string; cost: string }) {
  return { currency: row.currency, amount: number(row.cost) };
}

function groupedCosts(filters: SQL[], column: typeof usageEvents.userId | typeof usageEvents.modelId | typeof usageEvents.operation) {
  return db.select({ id: column, currency: costCurrency, cost: costTotal }).from(usageEvents).where(costQueryFilters(filters)).groupBy(column, costCurrency) as Promise<CostRow[]>;
}

function groupedTeamCosts(input: UsageAnalyticsInput, filters: SQL[]) {
  return db
    .select({ id: teams.id, currency: costCurrency, cost: costTotal })
    .from(usageEvents)
    .innerJoin(teamMembers, eq(usageEvents.userId, teamMembers.userId))
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .innerJoin(workspaces, eq(workspaces.id, input.workspaceId))
    .where(and(...filters, eq(teams.organizationId, workspaces.organizationId), sql`${costValue} is not null`, sql`${costCurrency} is not null`))
    .groupBy(teams.id, costCurrency) as Promise<CostRow[]>;
}
