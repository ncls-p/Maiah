export type UsageCost = { currency: string; amount: number };

export type UsageMetric = {
  events: number;
  inputTokens: number;
  outputTokens: number;
  failedEvents: number;
  averageLatencyMs: number;
  costs: UsageCost[];
};

export type UsageEvent = {
  id: string;
  operation: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  metadataJson: unknown;
  status: string | null;
  latencyMs: number | null;
  createdAt: string;
  userName: string | null;
  modelName: string | null;
  modelId: string | null;
  providerName: string | null;
};

export type UsageBreakdown = UsageMetric & {
  id: string | null;
  name?: string | null;
  email?: string | null;
  modelId?: string | null;
  providerName?: string | null;
  operation?: string;
};

export interface UsageResponse {
  totals: UsageMetric;
  daily: Array<
    Pick<UsageMetric, "events" | "inputTokens" | "outputTokens"> & {
      date: string;
    }
  >;
  users: UsageBreakdown[];
  teams: UsageBreakdown[];
  models: UsageBreakdown[];
  operations: UsageBreakdown[];
  events: UsageEvent[];
  quota: { limit: number; used: number; remaining: number } | null;
}
