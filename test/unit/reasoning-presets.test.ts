import { describe, expect, it } from "vitest";

import {
  defaultReasoningPreset,
  normalizeReasoningPresets,
  reasoningCallSettings,
  reasoningPresetSchema,
} from "@/modules/agent/reasoning-presets";

describe("reasoning presets", () => {
  it("normalizes, de-duplicates, and orders configured presets", () => {
    expect(
      normalizeReasoningPresets([
        "ultra",
        "none",
        "low",
        "invalid",
        "low",
        "high",
      ]),
    ).toEqual(["none", "low", "high", "ultra"]);
    expect(reasoningPresetSchema.parse("none")).toBe("none");
    expect(() => reasoningPresetSchema.parse("invalid")).toThrow();
  });

  it("prefers medium, then the first enabled reasoning level", () => {
    expect(defaultReasoningPreset(["none", "low", "medium", "high"])).toBe(
      "medium",
    );
    expect(defaultReasoningPreset(["none", "high", "ultra"])).toBe("high");
    expect(defaultReasoningPreset(["none"])).toBe("none");
    expect(defaultReasoningPreset([])).toBeNull();
  });

  it("uses the portable AI SDK reasoning setting through xhigh", () => {
    expect(
      reasoningCallSettings("xhigh", {
        kind: "vercel-ai-gateway",
      }),
    ).toEqual({ reasoning: "xhigh" });
    expect(
      reasoningCallSettings("none", {
        kind: "vercel-ai-gateway",
      }),
    ).toEqual({ reasoning: "none" });
  });

  it("disables Anthropic thinking when reasoning is off", () => {
    expect(
      reasoningCallSettings("none", {
        kind: "anthropic-compatible",
      }),
    ).toEqual({
      reasoning: "none",
      providerOptions: { anthropic: { thinking: { type: "disabled" } } },
    });
    expect(
      reasoningCallSettings("high", {
        kind: "anthropic-compatible",
      }),
    ).toEqual({ reasoning: "high" });
  });

  it("forces reasoning on OpenAI-compatible Responses for custom model IDs", () => {
    expect(
      reasoningCallSettings("high", {
        kind: "openai-compatible",
        openaiCompatibleApiRoute: "responses",
      }),
    ).toEqual({
      reasoning: "high",
      providerOptions: {
        openai: { reasoningEffort: "high", forceReasoning: true },
      },
    });
  });

  it("sends none on OpenAI-compatible APIs that otherwise omit the field", () => {
    expect(
      reasoningCallSettings("none", {
        kind: "openai-compatible",
        openaiCompatibleApiRoute: "responses",
        openaiCompatibilityProfile: "llama.cpp",
      }),
    ).toEqual({
      reasoning: "none",
      providerOptions: {
        openai: {
          reasoningEffort: "none",
          forceReasoning: true,
          reasoningSummary: null,
          store: false,
        },
      },
    });
    expect(
      reasoningCallSettings("none", {
        kind: "openai-compatible",
        openaiCompatibleApiRoute: "chat-completions",
      }),
    ).toEqual({
      reasoning: "none",
      providerOptions: { openaiCompatible: { reasoningEffort: "none" } },
    });
  });

  it("omits llama.cpp reasoning summaries so only effort is forwarded", () => {
    expect(
      reasoningCallSettings("medium", {
        kind: "openai-compatible",
        openaiCompatibleApiRoute: "responses",
        openaiCompatibilityProfile: "llama.cpp",
      }),
    ).toEqual({
      reasoning: "medium",
      providerOptions: {
        openai: {
          reasoningEffort: "medium",
          forceReasoning: true,
          reasoningSummary: null,
          store: false,
        },
      },
    });
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
      providerOptions: {
        openai: { reasoningEffort: "max", forceReasoning: true },
      },
    });
  });

  it("maps llama.cpp ultra to xhigh instead of OpenAI max", () => {
    expect(
      reasoningCallSettings("ultra", {
        kind: "openai-compatible",
        openaiCompatibleApiRoute: "responses",
        openaiCompatibilityProfile: "llama.cpp",
      }),
    ).toEqual({
      providerOptions: {
        openai: {
          reasoningEffort: "xhigh",
          forceReasoning: true,
          reasoningSummary: null,
          store: false,
        },
      },
    });
    expect(
      reasoningCallSettings("ultra", {
        kind: "openai-compatible",
        openaiCompatibleApiRoute: "chat-completions",
        openaiCompatibilityProfile: "llama.cpp",
      }),
    ).toEqual({
      providerOptions: { openaiCompatible: { reasoningEffort: "xhigh" } },
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
