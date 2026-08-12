import type { LanguageModelUsage } from "ai";

export type ChatMessageMetrics = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  durationMs?: number;
};

function metricValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function normalizeChatMessageMetrics(
  value: Partial<ChatMessageMetrics> | null | undefined,
): ChatMessageMetrics | undefined {
  if (!value) return undefined;
  const metrics = {
    inputTokens: metricValue(value.inputTokens),
    outputTokens: metricValue(value.outputTokens),
    totalTokens: metricValue(value.totalTokens),
    cacheReadTokens: metricValue(value.cacheReadTokens),
    cacheWriteTokens: metricValue(value.cacheWriteTokens),
    reasoningTokens: metricValue(value.reasoningTokens),
    durationMs: metricValue(value.durationMs),
  } satisfies ChatMessageMetrics;

  return Object.values(metrics).some((metric) => metric !== undefined)
    ? metrics
    : undefined;
}

export function chatMessageMetricsFromUsage(
  usage: LanguageModelUsage,
  durationMs: number,
  previous: { inputTokens?: number | null; outputTokens?: number | null } = {},
) {
  const inputTokens =
    usage.inputTokens === undefined && previous.inputTokens == null
      ? undefined
      : (usage.inputTokens ?? 0) + (previous.inputTokens ?? 0);
  const outputTokens =
    usage.outputTokens === undefined && previous.outputTokens == null
      ? undefined
      : (usage.outputTokens ?? 0) + (previous.outputTokens ?? 0);
  const isContinuation =
    previous.inputTokens != null || previous.outputTokens != null;
  return normalizeChatMessageMetrics({
    inputTokens,
    outputTokens,
    totalTokens: isContinuation
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : usage.totalTokens,
    cacheReadTokens: usage.inputTokenDetails.cacheReadTokens,
    cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens,
    reasoningTokens: usage.outputTokenDetails.reasoningTokens,
    durationMs,
  });
}

export function chatMessageMetricsFromStoredMessage(input: {
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
  completedAt: Date | null;
}) {
  const inputTokens = metricValue(input.inputTokens);
  const outputTokens = metricValue(input.outputTokens);
  const durationMs = input.completedAt
    ? Math.max(0, input.completedAt.getTime() - input.createdAt.getTime())
    : undefined;

  return normalizeChatMessageMetrics({
    inputTokens,
    outputTokens,
    totalTokens:
      inputTokens === undefined && outputTokens === undefined
        ? undefined
        : (inputTokens ?? 0) + (outputTokens ?? 0),
    durationMs,
  });
}

export function outputTokensPerSecond(metrics: ChatMessageMetrics) {
  if (
    metrics.outputTokens === undefined ||
    metrics.durationMs === undefined ||
    metrics.durationMs <= 0
  ) {
    return undefined;
  }
  return metrics.outputTokens / (metrics.durationMs / 1_000);
}
