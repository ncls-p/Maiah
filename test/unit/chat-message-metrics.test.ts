import { describe, expect, it } from "vitest";

import { createGenerationClock } from "@/modules/chat/generation-clock";
import {
  chatMessageMetricsFromStoredMessage,
  chatMessageMetricsFromUsage,
  chatMessageMetricsFromUsageMetadata,
  latestChatUsageMetricsByMessageId,
  normalizeChatMessageMetrics,
  outputTokensPerSecond,
} from "@/modules/chat/message-metrics";

function usage(overrides: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}) {
  return {
    inputTokens: overrides.inputTokens,
    outputTokens: overrides.outputTokens,
    totalTokens: overrides.totalTokens,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: overrides.cacheReadTokens,
      cacheWriteTokens: overrides.cacheWriteTokens,
    },
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: overrides.reasoningTokens,
    },
  };
}

describe("chat message metrics", () => {
  it("preserves provider usage details and decode throughput", () => {
    const metrics = chatMessageMetricsFromUsage(
      usage({
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        cacheReadTokens: 40,
        cacheWriteTokens: 10,
        reasoningTokens: 5,
      }),
      {
        durationMs: 2_000,
        timeToFirstTokenMs: 800,
        generationMs: 1_200,
      },
    );

    expect(metrics).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
      reasoningTokens: 5,
      durationMs: 2_000,
      timeToFirstTokenMs: 800,
      generationMs: 1_200,
    });
    expect(outputTokensPerSecond(metrics!)).toBe(25);
  });

  it("rebuilds durable metrics from stored message data without fake tok/s", () => {
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
    expect(outputTokensPerSecond(metrics!)).toBeUndefined();
  });

  it("adds earlier tokens when continuing a response", () => {
    const metrics = chatMessageMetricsFromUsage(
      usage({
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 25,
      }),
      { durationMs: 1_000, generationMs: 400 },
      {
        inputTokens: 80,
        outputTokens: 15,
        cacheReadTokens: 40,
        reasoningTokens: 3,
        durationMs: 2_000,
        timeToFirstTokenMs: 250,
        generationMs: 900,
        toolMs: 500,
        thinkingMs: 200,
      },
    );

    expect(metrics).toMatchObject({
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      cacheReadTokens: 40,
      reasoningTokens: 3,
      durationMs: 3_000,
      timeToFirstTokenMs: 250,
      generationMs: 1_300,
      toolMs: 500,
      thinkingMs: 200,
    });
    expect(outputTokensPerSecond(metrics!)).toBeCloseTo(15.384, 2);
  });

  it("keeps the original TTFT when a later step has its own first token", () => {
    const metrics = chatMessageMetricsFromUsage(
      usage({ inputTokens: 10, outputTokens: 4, totalTokens: 14 }),
      { durationMs: 500, timeToFirstTokenMs: 120, generationMs: 300 },
      { inputTokens: 10, outputTokens: 2, timeToFirstTokenMs: 80 },
    );

    expect(metrics?.timeToFirstTokenMs).toBe(80);
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
    expect(
      outputTokensPerSecond({ outputTokens: 10, durationMs: 2_000 }),
    ).toBeUndefined();
  });

  it("overlays persisted timings onto stored message tokens", () => {
    const metrics = chatMessageMetricsFromStoredMessage({
      inputTokens: 20,
      outputTokens: 10,
      createdAt: new Date("2026-08-12T08:00:00.000Z"),
      completedAt: new Date("2026-08-12T08:00:08.000Z"),
      usageMetrics: chatMessageMetricsFromUsageMetadata({
        durationMs: 2_400,
        timeToFirstTokenMs: 400,
        generationMs: 1_000,
        toolMs: 800,
        thinkingMs: 200,
      }),
    });

    expect(metrics).toMatchObject({
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      durationMs: 2_400,
      timeToFirstTokenMs: 400,
      generationMs: 1_000,
      toolMs: 800,
      thinkingMs: 200,
    });
    expect(outputTokensPerSecond(metrics!)).toBe(10);
  });

  it("keeps the latest usage metrics per message", () => {
    const byMessageId = latestChatUsageMetricsByMessageId([
      {
        createdAt: new Date("2026-08-12T08:00:01.000Z"),
        metadataJson: { messageId: "msg-1", toolMs: 100, thinkingMs: 50 },
      },
      {
        createdAt: new Date("2026-08-12T08:00:03.000Z"),
        metadataJson: { messageId: "msg-1", toolMs: 400, thinkingMs: 80 },
      },
    ]);

    expect(byMessageId.get("msg-1")).toMatchObject({
      toolMs: 400,
      thinkingMs: 80,
    });
  });
});

describe("generation clock", () => {
  it("measures TTFT and decode time without tool waits", () => {
    let now = 1_000;
    const clock = createGenerationClock(1_000, () => now);

    now = 1_400;
    clock.observe("text-delta");
    now = 1_500;
    clock.observe("text-delta");
    now = 1_600;
    clock.observe("tool-call");
    now = 2_400;
    clock.observe("tool-result");
    now = 2_500;
    clock.observe("text-delta");
    now = 2_800;
    clock.observe("text-delta");

    expect(clock.snapshot()).toEqual({
      durationMs: 1_800,
      timeToFirstTokenMs: 400,
      generationMs: 400,
      toolMs: 800,
      thinkingMs: 100,
    });
    expect(
      outputTokensPerSecond({ outputTokens: 20, generationMs: 400 }),
    ).toBe(50);
  });

  it("starts TTFT on the first reasoning token, not the empty start event", () => {
    let now = 0;
    const clock = createGenerationClock(0, () => now);
    now = 300;
    clock.observe("reasoning-start");
    now = 900;
    clock.observe("reasoning-delta");
    expect(clock.snapshot()).toEqual({
      durationMs: 900,
      timeToFirstTokenMs: 900,
      generationMs: undefined,
      thinkingMs: 600,
    });
  });

  it("excludes intervaled thinking gaps and later tool time from decode T/S", () => {
    let now = 0;
    const clock = createGenerationClock(0, () => now);

    now = 200;
    clock.observe("reasoning-start");
    now = 400;
    clock.observe("reasoning-delta");
    now = 700;
    clock.observe("reasoning-delta");
    now = 800;
    clock.observe("reasoning-end");
    now = 2_000;
    clock.observe("text-delta");
    now = 2_300;
    clock.observe("text-delta");
    now = 2_400;
    clock.observe("tool-call");
    now = 5_000;
    clock.observe("tool-result");
    now = 5_200;
    clock.observe("reasoning-start");
    now = 5_400;
    clock.observe("reasoning-delta");
    now = 5_600;
    clock.observe("reasoning-delta");
    now = 5_650;
    clock.observe("reasoning-end");
    now = 5_800;
    clock.observe("text-delta");
    now = 6_100;
    clock.observe("text-delta");

    expect(clock.snapshot()).toEqual({
      durationMs: 6_100,
      timeToFirstTokenMs: 400,
      generationMs: 1_100,
      toolMs: 2_600,
      thinkingMs: 2_600,
    });
  });

  it("unions overlapping tool windows instead of summing them", () => {
    let now = 0;
    const clock = createGenerationClock(0, () => now);
    now = 100;
    clock.observe("tool-call", "a");
    now = 200;
    clock.observe("tool-call", "b");
    now = 400;
    clock.observe("tool-result", "b");
    now = 700;
    clock.observe("tool-result", "a");

    expect(clock.snapshot()).toEqual({
      durationMs: 700,
      toolMs: 600,
    });
  });

  it("sums sequential tool rounds and counts the gap as thinking", () => {
    let now = 0;
    const clock = createGenerationClock(0, () => now);
    now = 50;
    clock.observe("text-delta");
    now = 100;
    clock.observe("tool-call", "a");
    now = 400;
    clock.observe("tool-result", "a");
    now = 500;
    clock.observe("tool-call", "b");
    now = 800;
    clock.observe("tool-result", "b");
    now = 900;
    clock.observe("text-delta");

    expect(clock.snapshot()).toEqual({
      durationMs: 900,
      timeToFirstTokenMs: 50,
      generationMs: undefined,
      toolMs: 600,
      thinkingMs: 200,
    });
  });

  it("includes trailing tool time in turn duration", () => {
    let now = 0;
    const clock = createGenerationClock(0, () => now);
    now = 100;
    clock.observe("text-delta");
    now = 200;
    clock.observe("tool-call", "search");
    now = 800;
    clock.observe("tool-result", "search");

    expect(clock.snapshot()).toEqual({
      durationMs: 800,
      timeToFirstTokenMs: 100,
      generationMs: undefined,
      toolMs: 600,
      thinkingMs: undefined,
    });
  });
});
