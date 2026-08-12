import { describe, expect, it } from "vitest";

import {
  chatMessageMetricsFromStoredMessage,
  chatMessageMetricsFromUsage,
  normalizeChatMessageMetrics,
  outputTokensPerSecond,
} from "@/modules/chat/message-metrics";

describe("chat message metrics", () => {
  it("preserves provider usage details", () => {
    const metrics = chatMessageMetricsFromUsage(
      {
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        inputTokenDetails: {
          noCacheTokens: 80,
          cacheReadTokens: 40,
          cacheWriteTokens: 10,
        },
        outputTokenDetails: { textTokens: 25, reasoningTokens: 5 },
      },
      2_000,
    );

    expect(metrics).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
      reasoningTokens: 5,
      durationMs: 2_000,
    });
  });

  it("rebuilds durable metrics from stored message data", () => {
    const metrics = chatMessageMetricsFromStoredMessage({
      inputTokens: 20,
      outputTokens: 10,
      createdAt: new Date("2026-08-12T08:00:00.000Z"),
      completedAt: new Date("2026-08-12T08:00:04.000Z"),
    });

    expect(metrics).toEqual({
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      durationMs: 4_000,
    });
    expect(outputTokensPerSecond(metrics!)).toBe(2.5);
  });

  it("adds earlier tokens when continuing a response", () => {
    const metrics = chatMessageMetricsFromUsage(
      {
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 25,
        inputTokenDetails: {
          noCacheTokens: 20,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
          textTokens: 5,
          reasoningTokens: undefined,
        },
      },
      1_000,
      { inputTokens: 80, outputTokens: 15 },
    );

    expect(metrics).toMatchObject({
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    });
  });

  it("omits unavailable and invalid metrics", () => {
    expect(normalizeChatMessageMetrics(null)).toBeUndefined();
    expect(
      normalizeChatMessageMetrics({
        inputTokens: Number.NaN,
        outputTokens: -1,
      }),
    ).toBeUndefined();
    expect(outputTokensPerSecond({ outputTokens: 10 })).toBeUndefined();
  });
});
