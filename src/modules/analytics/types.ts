import type { AnalyticsScope } from "./query";
export type Option = { id: string; name: string };
export type Facets = Record<string, Option[]>;
export type Cost = { currency: string; amount: number };
export type Metrics = {
  events: number;
  inputTokens: number;
  outputTokens: number;
  failedEvents: number;
  averageLatencyMs: number;
  unpricedEvents: number;
  costs: Cost[];
};
export type UsageGroup = Metrics & { id: string; name: string };
export type UsageAnalytics = {
  period: {
    from: string | null;
    to: string | null;
    bucket: "day" | "week" | "month";
  };
  quota: { limit: number; used: number; remaining: number } | null;
  scope: AnalyticsScope;
  facets: Facets;
  totals: Metrics;
  groups: UsageGroup[];
  series: Array<UsageGroup & { date: string }>;
  events: Array<{
    id: string;
    createdAt: string;
    operation: string;
    status: string | null;
    userName: string | null;
    workspaceName: string | null;
    providerName: string | null;
    modelName: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number | null;
    cost: string | null;
    currency: string | null;
  }>;
  offset: number;
  limit: number;
};
export type AuditAnalytics = {
  scope: AnalyticsScope;
  facets: Facets;
  totals: { total: number; success: number; failed: number; denied: number };
  events: Array<{
    id: string;
    createdAt: string;
    action: string;
    outcome: string;
    actorName: string | null;
    actorEmail: string | null;
    actorPrincipalId: string | null;
    resourceType: string | null;
    resourceId: string | null;
    workspaceName: string | null;
    organizationName: string | null;
    metadataJson: unknown;
  }>;
  offset: number;
  limit: number;
};
