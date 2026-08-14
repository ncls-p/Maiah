import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { z } from "zod";

import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";

export const REASONING_PRESETS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "ultra",
] as const;

export type ReasoningPreset = (typeof REASONING_PRESETS)[number];

export const reasoningPresetSchema = z.enum(REASONING_PRESETS);

export function normalizeReasoningPresets(value: unknown): ReasoningPreset[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set(value);
  return REASONING_PRESETS.filter((preset) => selected.has(preset));
}

export function defaultReasoningPreset(
  presets: readonly ReasoningPreset[],
): ReasoningPreset | null {
  if (presets.includes("medium")) return "medium";
  return presets.find((preset) => preset !== "none") ?? presets[0] ?? null;
}

type ReasoningRuntimeConfig = {
  kind: string;
  openaiCompatibleApiRoute?: string;
  openaiCompatibilityProfile?: string;
};

type ReasoningCallSettings = {
  reasoning?: Exclude<ReasoningPreset, "ultra">;
  providerOptions?: ProviderOptions;
};

function isOpenAICompatibleResponses(provider: ReasoningRuntimeConfig) {
  return (
    provider.kind === "openai-compatible" &&
    normalizeOpenAICompatibleApiRoute(provider.openaiCompatibleApiRoute) ===
      "responses"
  );
}

function isLlamaCpp(provider: ReasoningRuntimeConfig) {
  return provider.openaiCompatibilityProfile === "llama.cpp";
}

function portableReasoning(preset: ReasoningPreset) {
  return preset === "ultra" ? undefined : preset;
}

function openaiCompatibleEffort(
  preset: ReasoningPreset,
  provider: ReasoningRuntimeConfig,
) {
  if (preset !== "ultra") return preset;
  return isLlamaCpp(provider) ? "xhigh" : "max";
}

function openaiResponsesReasoningOptions(
  provider: ReasoningRuntimeConfig,
  effort: string,
): ProviderOptions {
  return {
    openai: {
      reasoningEffort: effort,
      // Custom model IDs are not treated as reasoning models by @ai-sdk/openai.
      forceReasoning: true,
      ...(isLlamaCpp(provider) ? { reasoningSummary: null, store: false } : {}),
    },
  };
}

function anthropicCallSettings(preset: ReasoningPreset): ReasoningCallSettings {
  if (preset === "none") {
    return {
      reasoning: "none",
      providerOptions: { anthropic: { thinking: { type: "disabled" } } },
    };
  }
  if (preset === "ultra") {
    return { providerOptions: { anthropic: { effort: "max" } } };
  }
  return { reasoning: preset };
}

function openaiCompatibleCallSettings(
  preset: ReasoningPreset,
  provider: ReasoningRuntimeConfig,
): ReasoningCallSettings {
  const reasoning = portableReasoning(preset);
  const effort = openaiCompatibleEffort(preset, provider);
  if (isOpenAICompatibleResponses(provider)) {
    return {
      ...(reasoning ? { reasoning } : {}),
      providerOptions: openaiResponsesReasoningOptions(provider, effort),
    };
  }
  return {
    ...(reasoning ? { reasoning } : {}),
    providerOptions: { openaiCompatible: { reasoningEffort: effort } },
  };
}

export function reasoningCallSettings(
  preset: ReasoningPreset | null | undefined,
  provider: ReasoningRuntimeConfig,
): ReasoningCallSettings {
  if (!preset) return {};
  if (provider.kind === "anthropic-compatible") {
    return anthropicCallSettings(preset);
  }
  if (provider.kind === "openai-compatible" || provider.kind === "native") {
    return openaiCompatibleCallSettings(preset, provider);
  }
  if (preset === "ultra") return { reasoning: "xhigh" };
  return { reasoning: preset };
}
