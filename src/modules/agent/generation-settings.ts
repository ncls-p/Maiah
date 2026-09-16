import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { reasoningPresetSchema, REASONING_PRESETS } from "./reasoning-presets";

// Provider options are JSON, never headers, credentials or executable code.
export const generationSettingsSchema = z.object({
  topK: z.number().int().positive().optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  stopSequences: z.array(z.string().min(1).max(1000)).max(16).optional(),
  reasoningPresets: z
    .array(reasoningPresetSchema)
    .max(REASONING_PRESETS.length)
    .optional(),
  providerOptions: z
    .record(z.string(), z.record(z.string(), z.json()))
    .refine(
      (value) => JSON.stringify(value).length <= 16_000,
      "provider_options must not exceed 16 KB",
    )
    .optional(),
});
export type AgentGenerationSettings = z.infer<typeof generationSettingsSchema>;

export function generationCallSettings(version: {
  temperature?: string | null;
  topP?: string | null;
  generationSettingsJson?: unknown;
}) {
  const settings = (version.generationSettingsJson ??
    {}) as AgentGenerationSettings;
  const number = (value: string | null | undefined) =>
    value != null && value !== "" && Number.isFinite(Number(value))
      ? Number(value)
      : undefined;
  return {
    temperature: number(version.temperature),
    topP: number(version.topP),
    topK: settings.topK,
    presencePenalty: settings.presencePenalty,
    frequencyPenalty: settings.frequencyPenalty,
    seed: settings.seed,
    maxRetries: settings.maxRetries,
    stopSequences: settings.stopSequences?.length
      ? settings.stopSequences
      : undefined,
    providerOptions: settings.providerOptions,
  };
}

export function mergeProviderOptions(
  base: ProviderOptions | undefined,
  override: ProviderOptions | undefined,
) {
  const merged = { ...base };
  for (const [provider, options] of Object.entries(override ?? {}))
    merged[provider] = { ...merged[provider], ...options };
  return merged;
}
