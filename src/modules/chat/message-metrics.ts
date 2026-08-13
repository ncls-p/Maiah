import type { LanguageModelUsage } from "ai";

export type ChatMessageMetrics = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  durationMs?: number;
  timeToFirstTokenMs?: number;
  generationMs?: number;
  toolMs?: number;
  thinkingMs?: number;
};

export type ChatGenerationTimings = {
  durationMs: number;
  timeToFirstTokenMs?: number;
  generationMs?: number;
  toolMs?: number;
  thinkingMs?: number;
};

type PreviousChatMessageMetrics = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  reasoningTokens?: number | null;
  durationMs?: number | null;
  timeToFirstTokenMs?: number | null;
  generationMs?: number | null;
  toolMs?: number | null;
  thinkingMs?: number | null;
};

function metricValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function addMetric(
  current: number | null | undefined,
  previous: number | null | undefined,
) {
  if (current == null && previous == null) return undefined;
  return (current ?? 0) + (previous ?? 0);
}

function numberField(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function messageIdField(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
    timeToFirstTokenMs: metricValue(value.timeToFirstTokenMs),
    generationMs: metricValue(value.generationMs),
    toolMs: metricValue(value.toolMs),
    thinkingMs: metricValue(value.thinkingMs),
  } satisfies ChatMessageMetrics;

  return Object.values(metrics).some((metric) => metric !== undefined)
    ? metrics
    : undefined;
}

export function chatMessageMetricsFromUsageMetadata(value: unknown) {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  return normalizeChatMessageMetrics({
    inputTokens: numberField(record.inputTokens),
    outputTokens: numberField(record.outputTokens),
    totalTokens: numberField(record.totalTokens),
    cacheReadTokens: numberField(record.cacheReadTokens),
    cacheWriteTokens: numberField(record.cacheWriteTokens),
    reasoningTokens: numberField(record.reasoningTokens),
    durationMs: numberField(record.durationMs),
    timeToFirstTokenMs: numberField(record.timeToFirstTokenMs),
    generationMs: numberField(record.generationMs),
    toolMs: numberField(record.toolMs),
    thinkingMs: numberField(record.thinkingMs),
  });
}

export function latestChatUsageMetricsByMessageId(
  events: Array<{ metadataJson: unknown; createdAt: Date }>,
) {
  const ranked = events
    .map((event) => {
      if (typeof event.metadataJson !== "object" || event.metadataJson === null)
        return null;
      const messageId = messageIdField(
        (event.metadataJson as Record<string, unknown>).messageId,
      );
      const metrics = chatMessageMetricsFromUsageMetadata(event.metadataJson);
      if (!messageId || !metrics) return null;
      return { messageId, createdAt: event.createdAt.getTime(), metrics };
    })
    .filter(
      (
        event,
      ): event is {
        messageId: string;
        createdAt: number;
        metrics: ChatMessageMetrics;
      } => event !== null,
    )
    .sort((left, right) => left.createdAt - right.createdAt);

  const byMessageId = new Map<string, ChatMessageMetrics>();
  for (const event of ranked) byMessageId.set(event.messageId, event.metrics);
  return byMessageId;
}

export function previousMetricsForContinuation(
  message: {
    tokenInput?: number | null;
    tokenOutput?: number | null;
  },
  usageMetrics: ChatMessageMetrics | undefined,
): PreviousChatMessageMetrics {
  return {
    inputTokens: message.tokenInput,
    outputTokens: message.tokenOutput,
    cacheReadTokens: usageMetrics?.cacheReadTokens,
    cacheWriteTokens: usageMetrics?.cacheWriteTokens,
    reasoningTokens: usageMetrics?.reasoningTokens,
    durationMs: usageMetrics?.durationMs,
    timeToFirstTokenMs: usageMetrics?.timeToFirstTokenMs,
    generationMs: usageMetrics?.generationMs,
    toolMs: usageMetrics?.toolMs,
    thinkingMs: usageMetrics?.thinkingMs,
  };
}

export function chatMessageMetricsFromUsage(
  usage: LanguageModelUsage,
  timings: ChatGenerationTimings,
  previous: PreviousChatMessageMetrics = {},
) {
  const inputTokens = addMetric(usage.inputTokens, previous.inputTokens);
  const outputTokens = addMetric(usage.outputTokens, previous.outputTokens);
  const isContinuation =
    previous.inputTokens != null || previous.outputTokens != null;
  const totalTokens = isContinuation
    ? addMetric(
        usage.totalTokens ?? addMetric(usage.inputTokens, usage.outputTokens),
        previous.totalTokens ??
          addMetric(previous.inputTokens, previous.outputTokens),
      )
    : (usage.totalTokens ?? addMetric(inputTokens, outputTokens));

  return normalizeChatMessageMetrics({
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens: addMetric(
      usage.inputTokenDetails?.cacheReadTokens,
      previous.cacheReadTokens,
    ),
    cacheWriteTokens: addMetric(
      usage.inputTokenDetails?.cacheWriteTokens,
      previous.cacheWriteTokens,
    ),
    reasoningTokens: addMetric(
      usage.outputTokenDetails?.reasoningTokens,
      previous.reasoningTokens,
    ),
    durationMs: addMetric(timings.durationMs, previous.durationMs),
    timeToFirstTokenMs: metricValue(
      previous.timeToFirstTokenMs ?? timings.timeToFirstTokenMs,
    ),
    generationMs: addMetric(timings.generationMs, previous.generationMs),
    toolMs: addMetric(timings.toolMs, previous.toolMs),
    thinkingMs: addMetric(timings.thinkingMs, previous.thinkingMs),
  });
}

export function chatMessageMetricsFromStoredMessage(input: {
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
  completedAt: Date | null;
  usageMetrics?: ChatMessageMetrics;
}) {
  const inputTokens = metricValue(input.inputTokens);
  const outputTokens = metricValue(input.outputTokens);
  const durationMs = input.completedAt
    ? Math.max(0, input.completedAt.getTime() - input.createdAt.getTime())
    : undefined;

  return normalizeChatMessageMetrics({
    ...input.usageMetrics,
    inputTokens,
    outputTokens,
    totalTokens:
      inputTokens === undefined && outputTokens === undefined
        ? input.usageMetrics?.totalTokens
        : (inputTokens ?? 0) + (outputTokens ?? 0),
    durationMs: input.usageMetrics?.durationMs ?? durationMs,
  });
}

export function outputTokensPerSecond(metrics: ChatMessageMetrics) {
  if (
    metrics.outputTokens === undefined ||
    metrics.generationMs === undefined ||
    metrics.generationMs <= 0
  ) {
    return undefined;
  }
  return metrics.outputTokens / (metrics.generationMs / 1_000);
}
