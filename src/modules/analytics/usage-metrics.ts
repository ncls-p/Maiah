import { sql } from "drizzle-orm";
import { usageEvents } from "@/server/infrastructure/db/schema";
import type { UsageGroup } from "./types";

// Imported/provider metadata can contain empty or non-numeric prices.
export const usageCost = sql<
  string | null
>`case when (${usageEvents.metadataJson}->>'cost') ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]{1,2})?$' then (${usageEvents.metadataJson}->>'cost')::numeric when ${usageEvents.costUsd} ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]{1,2})?$' then ${usageEvents.costUsd}::numeric end`;
export const usageCurrency = sql<
  string | null
>`case when (${usageEvents.metadataJson}->>'cost') ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]{1,2})?$' then nullif(upper(${usageEvents.metadataJson}->>'currency'), '') when ${usageEvents.costUsd} ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]{1,2})?$' then 'USD' end`;
export const metricColumns = {
  events: sql<number>`count(*)::float8`,
  inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}),0)::float8`,
  outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}),0)::float8`,
  failedEvents: sql<number>`count(*) filter (where ${usageEvents.status} in ('failed','error','failure','timed_out'))::float8`,
  latencySum: sql<number>`coalesce(sum(${usageEvents.latencyMs}),0)::float8`,
  latencyCount: sql<number>`count(${usageEvents.latencyMs})::float8`,
  unpricedEvents: sql<number>`count(*) filter (where ${usageCost} is null or ${usageCurrency} is null)::float8`,
  amount: sql<number>`coalesce(sum(${usageCost}),0)::float8`,
};
export type MetricRow = {
  id: string | null;
  name: string | null;
  date?: string;
  currency: string | null;
  events: number;
  inputTokens: number;
  outputTokens: number;
  failedEvents: number;
  latencySum: number;
  latencyCount: number;
  unpricedEvents: number;
  amount: number;
};
export function combineMetricRows(
  rows: MetricRow[],
): Array<UsageGroup & { date: string }> {
  const result = new Map<
    string,
    UsageGroup & { date: string; latencySum: number; latencyCount: number }
  >();
  for (const row of rows) {
    const key = JSON.stringify([row.date, row.id]);
    const item = result.get(key) ?? {
      id: row.id ?? "unknown",
      name: row.name ?? row.id ?? "",
      date: row.date ?? "",
      events: 0,
      inputTokens: 0,
      outputTokens: 0,
      failedEvents: 0,
      averageLatencyMs: 0,
      unpricedEvents: 0,
      costs: [],
      latencySum: 0,
      latencyCount: 0,
    };
    for (const field of [
      "events",
      "inputTokens",
      "outputTokens",
      "failedEvents",
      "unpricedEvents",
      "latencySum",
      "latencyCount",
    ] as const)
      item[field] += Number(row[field]);
    if (row.currency)
      item.costs.push({ currency: row.currency, amount: Number(row.amount) });
    item.averageLatencyMs = item.latencyCount
      ? Math.round(item.latencySum / item.latencyCount)
      : 0;
    result.set(key, item);
  }
  return [...result.values()].map((item) => ({
    id: item.id,
    name: item.name,
    date: item.date,
    events: item.events,
    inputTokens: item.inputTokens,
    outputTokens: item.outputTokens,
    failedEvents: item.failedEvents,
    averageLatencyMs: item.averageLatencyMs,
    unpricedEvents: item.unpricedEvents,
    costs: item.costs,
  }));
}
