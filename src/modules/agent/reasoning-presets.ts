import type { ProviderOptions } from "@ai-sdk/provider-utils";

export const REASONING_PRESETS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "ultra",
] as const;

export type ReasoningPreset = (typeof REASONING_PRESETS)[number];

export function normalizeReasoningPresets(value: unknown): ReasoningPreset[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set(value);
  return REASONING_PRESETS.filter((preset) => selected.has(preset));
}

export function defaultReasoningPreset(
  presets: readonly ReasoningPreset[],
): ReasoningPreset | null {
  if (presets.includes("medium")) return "medium";
  return presets[0] ?? null;
}

type ReasoningRuntimeConfig = {
  kind: string;
  openaiCompatibleApiRoute?: string;
};

export function reasoningCallSettings(
  preset: ReasoningPreset | null | undefined,
  provider: ReasoningRuntimeConfig,
): {
  reasoning?: Exclude<ReasoningPreset, "ultra">;
  providerOptions?: ProviderOptions;
} {
  if (!preset) return {};
  if (preset !== "ultra") return { reasoning: preset };

  if (provider.kind === "anthropic-compatible") {
    return { providerOptions: { anthropic: { effort: "max" } } };
  }
  if (
    provider.kind === "openai-compatible" &&
    provider.openaiCompatibleApiRoute === "responses"
  ) {
    return {
      providerOptions: { openai: { reasoningEffort: "max" } },
    };
  }
  if (provider.kind === "openai-compatible" || provider.kind === "native") {
    return {
      providerOptions: { openaiCompatible: { reasoningEffort: "max" } },
    };
  }

  // AI Gateway and mixed-provider adapters currently document xhigh as their
  // portable ceiling. Keeping the top-level setting lets the active adapter
  // translate it for OpenAI, Anthropic, Gemini, xAI, and compatible APIs.
  return { reasoning: "xhigh" };
}
