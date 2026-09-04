import {
  agentRuntimePolicy,
  createRuntimeDeadline,
  resolveAgentRuntimeLimits,
  runtimeDeadlineAt,
  timeoutMsUntil,
} from "@/modules/agent/runtime-policy";
import { MAX_GENERATION_OUTPUT_TOKENS } from "@/modules/chat/conversation-context-policy";
import { describe, expect, it } from "vitest";

describe("agent runtime policy", () => {
  it("keeps tool calls configurable and caps output tokens", () => {
    expect(
      resolveAgentRuntimeLimits({
        maxToolCalls: 9_999,
        maxOutputTokens: 9_999_999,
      }),
    ).toEqual({
      maxToolCalls: 9_999,
      maxSteps: 9_999 + agentRuntimePolicy.stepOverhead,
      maxOutputTokens: MAX_GENERATION_OUTPUT_TOKENS,
    });
  });

  it("caps the provider output limit for an automatic tool-free run", () => {
    expect(
      resolveAgentRuntimeLimits({
        maxToolCalls: 0,
        maxOutputTokens: 0,
        providerMaxOutputTokens: 131_072,
      }),
    ).toEqual({
      maxToolCalls: 0,
      maxSteps: 1,
      maxOutputTokens: MAX_GENERATION_OUTPUT_TOKENS,
    });
  });

  it("combines a parent cancellation with a deadline", () => {
    const controller = new AbortController();
    const deadline = createRuntimeDeadline(60_000, controller.signal);
    expect(deadline.signal.aborted).toBe(false);
    controller.abort("cancelled");
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.timeoutSignal.aborted).toBe(false);
  });

  it("treats a 0 timeout as unlimited and never arms a timer", async () => {
    const deadline = createRuntimeDeadline(0);
    expect(deadline.signal.aborted).toBe(false);
    expect(deadline.timeoutSignal.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(deadline.timeoutSignal.aborted).toBe(false);
  });

  it("keeps an unlimited deadline when a parent signal is provided", () => {
    const controller = new AbortController();
    const deadline = createRuntimeDeadline(0, controller.signal);
    expect(deadline.timeoutSignal.aborted).toBe(false);
    controller.abort("cancelled");
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.timeoutSignal.aborted).toBe(false);
  });

  it("preserves long finite deadlines without treating them as unlimited", () => {
    const timeoutMs = 45 * 24 * 60 * 60 * 1000;
    const deadlineAt = runtimeDeadlineAt(timeoutMs);
    expect(timeoutMsUntil(deadlineAt)).toBeGreaterThan(timeoutMs - 1_000);

    const deadline = createRuntimeDeadline(timeoutMsUntil(deadlineAt));
    expect(deadline.signal.aborted).toBe(false);
    expect(deadline.timeoutSignal.aborted).toBe(false);
    deadline.dispose();
  });
});
