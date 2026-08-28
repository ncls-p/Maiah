import { describe, expect, it } from "vitest";

import { createGenerationClock } from "@/modules/chat/generation-clock";
import { outputTokensPerSecond } from "@/modules/chat/message-metrics";

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
    expect(outputTokensPerSecond({ outputTokens: 20, generationMs: 400 })).toBe(
      50,
    );
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


