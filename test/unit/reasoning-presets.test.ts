import { describe, expect, it } from "vitest";

import {
  defaultReasoningPreset,
  normalizeReasoningPresets,
  reasoningCallSettings,
} from "@/modules/agent/reasoning-presets";

describe("reasoning presets", () => {
  it("normalizes, de-duplicates, and orders configured presets", () => {
    expect(
      normalizeReasoningPresets(["ultra", "low", "invalid", "low", "high"]),
    ).toEqual(["low", "high", "ultra"]);
  });

  it("prefers medium as the initial composer value", () => {
    expect(defaultReasoningPreset(["low", "medium", "high"])).toBe("medium");
    expect(defaultReasoningPreset(["high", "ultra"])).toBe("high");
    expect(defaultReasoningPreset([])).toBeNull();
  });

  it("uses the portable AI SDK reasoning setting through xhigh", () => {
    expect(
      reasoningCallSettings("xhigh", {
        kind: "vercel-ai-gateway",
      }),
    ).toEqual({ reasoning: "xhigh" });
  });

  it("maps ultra to provider maximums when supported", () => {
    expect(
      reasoningCallSettings("ultra", {
        kind: "anthropic-compatible",
      }),
    ).toEqual({ providerOptions: { anthropic: { effort: "max" } } });
    expect(
      reasoningCallSettings("ultra", {
        kind: "openai-compatible",
        openaiCompatibleApiRoute: "responses",
      }),
    ).toEqual({
      providerOptions: { openai: { reasoningEffort: "max" } },
    });
  });

  it("caps ultra at xhigh on mixed-provider gateways", () => {
    expect(
      reasoningCallSettings("ultra", {
        kind: "vercel-ai-gateway",
      }),
    ).toEqual({ reasoning: "xhigh" });
  });
});
