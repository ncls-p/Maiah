import type { ModelCapability, ModelDescriptor } from "./adapter";
import { DEFAULT_CAPABILITIES } from "./openai-compatible-adapter.default-capabilities";

type OpenAICompatibleModel = {
  // Official OpenAI Model object fields.
  id: string;
  object?: "model" | string;
  created?: number;
  owned_by?: string;
  max_model_len?: number;
  input_token_cost_per_million?: number | string;
  output_token_cost_per_million?: number | string;
  energy_kwh_per_million_tokens?: number | string;
  co2_grams_per_million_tokens?: number | string;
  currency?: string;
  pricing?: {
    input_per_million?: number | string;
    output_per_million?: number | string;
    currency?: string;
  };
  sustainability?: {
    energy_kwh_per_million_tokens?: number | string;
    co2_grams_per_million_tokens?: number | string;
    currency?: string;
  };

  // Non-standard fields exposed by OpenAI-compatible proxies such as llama.cpp.
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  backend?: string;
  task?: string;
  meta?: {
    n_ctx?: number;
    n_ctx_train?: number;
  };
};

function toPositiveNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && parsed > 0 ? parsed : undefined;
}

function toNonNegativeCost(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0
    ? String(parsed)
    : undefined;
}

function normalizeModalities(values: string[] | undefined) {
  return new Set((values ?? []).map((value) => value.toLowerCase()));
}

function capabilitiesFromModel(model: OpenAICompatibleModel): ModelCapability {
  const capabilities = { ...DEFAULT_CAPABILITIES };
  const inputModalities = normalizeModalities(
    model.architecture?.input_modalities,
  );
  const outputModalities = normalizeModalities(
    model.architecture?.output_modalities,
  );
  const task = model.task?.toLowerCase();

  if (inputModalities.has("image")) capabilities.vision = true;
  if (inputModalities.has("audio") || outputModalities.has("audio")) {
    capabilities.audio = true;
  }
  if (task === "embedding" || task === "embeddings") {
    capabilities.embeddings = true;
  }

  return capabilities;
}

function sustainabilityFromModel(model: OpenAICompatibleModel) {
  const energyKwhPerMillionTokens = toPositiveNumber(
    model.energy_kwh_per_million_tokens ??
      model.sustainability?.energy_kwh_per_million_tokens,
  );
  const co2GramsPerMillionTokens = toPositiveNumber(
    model.co2_grams_per_million_tokens ??
      model.sustainability?.co2_grams_per_million_tokens,
  );
  const hasApiPricing =
    toNonNegativeCost(
      model.input_token_cost_per_million ?? model.pricing?.input_per_million,
    ) !== undefined ||
    toNonNegativeCost(
      model.output_token_cost_per_million ?? model.pricing?.output_per_million,
    ) !== undefined;
  if (
    energyKwhPerMillionTokens === undefined &&
    co2GramsPerMillionTokens === undefined &&
    !hasApiPricing
  ) {
    return undefined;
  }
  return {
    energyKwhPerMillionTokens,
    co2GramsPerMillionTokens,
    source: "Provider API model metadata",
    currency:
      model.pricing?.currency ??
      model.sustainability?.currency ??
      model.currency ??
      "EUR",
  };
}

export function parseModels(data: unknown): ModelDescriptor[] {
  if (typeof data !== "object") return [];
  if (data === null) return [];
  const payload = data as { data?: unknown };
  if (!Array.isArray(payload.data)) return [];

  return (payload.data as OpenAICompatibleModel[])
    .filter((model) => typeof model.id === "string")
    .map((model) => ({
      modelId: model.id,
      displayName: model.id,
      capabilities: capabilitiesFromModel(model),
      contextWindow: toPositiveNumber(
        model.max_model_len ?? model.meta?.n_ctx ?? model.meta?.n_ctx_train,
      ),
      inputTokenCost: toNonNegativeCost(
        model.input_token_cost_per_million ?? model.pricing?.input_per_million,
      ),
      outputTokenCost: toNonNegativeCost(
        model.output_token_cost_per_million ??
          model.pricing?.output_per_million,
      ),
      sustainability: sustainabilityFromModel(model),
    }));
}
