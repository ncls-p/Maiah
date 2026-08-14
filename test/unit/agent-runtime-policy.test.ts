import {
  agentRuntimePolicy,
  createRuntimeDeadline,
  resolveAgentRuntimeLimits,
} from "@/modules/agent/runtime-policy";
import { describe, expect, it } from "vitest";

describe("agent runtime policy", () => {
  it("keeps configured tool calls and output tokens without application caps", () => {
    expect(
      resolveAgentRuntimeLimits({
        maxToolCalls: 9_999,
        maxOutputTokens: 9_999_999,
      }),
    ).toEqual({
      maxToolCalls: 9_999,
      maxSteps: 9_999 + agentRuntimePolicy.stepOverhead,
      maxOutputTokens: 9_999_999,
    });
  });

  it("keeps a tool-free run to one model step", () => {
    expect(
      resolveAgentRuntimeLimits({ maxToolCalls: 0, maxOutputTokens: 0 }),
    ).toEqual({ maxToolCalls: 0, maxSteps: 1, maxOutputTokens: 1 });
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
});
