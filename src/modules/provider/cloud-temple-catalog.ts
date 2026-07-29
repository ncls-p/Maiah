import type { ModelDescriptor } from "@/server/infrastructure/providers";

export const CLOUD_TEMPLE_BASE_URL = "https://api.ai.cloud-temple.com/v1";
export const CLOUD_TEMPLE_CATALOG_SOURCE =
  "Cloud Temple model catalog (docs.cloud-temple.com)";

const ENERGY_KWH_PER_MILLION_TOKENS: Record<string, number> = {
  "cogito:32b": 6.32,
  "gemma3:27b": 5.8,
  "glm-4.7-flash:30b": 1.58,
  "gpt-oss:120b": 2.37,
  "gpt-oss:20b": 3.25,
  "llama3.3:70b": 13.33,
  "ministral-3:14b": 4.74,
  "ministral-3:3b": 1.75,
  "ministral-3:8b": 3.33,
  "mistral-small3.2:24b": 5.05,
  "mistral-small4:119b": 2,
  "nemotron-3-super:120b": 1.93,
  "nemotron-cascade:30b": 1.93,
  "nemotron3-nano:30b": 1.56,
  "olmo-3:32b": 5.98,
  "olmo-3:7b": 1.13,
  "qwen3-2507-think:4b": 2.42,
  "qwen3-2507:235b": 3.97,
  "qwen3-omni:30b": 7.43,
  "qwen3.5:0.8b": 2.39,
  "qwen3.5:4b": 3.64,
  "qwen3.5:9b": 4.23,
  "qwen3.6:27b": 2.78,
  "qwen3:0.6b": 1.33,
  "devstral-small-2:24b": 4.23,
  "functiongemma:270m": 0.97,
  "qwen-coder-next:80b": 2.29,
  "qwen3-next:80b": 2.09,
  "qwen3.6:35b": 2.07,
  "rnj-1:8b": 1.69,
  "deepseek-ocr": 0.66,
  "gemma4:31b": 3.77,
  "gemma4:e2b": 1.11,
  "gemma4:e4b": 1.63,
  "granite3.2-vision:2b": 0.8,
  "qwen3-vl:235b": 5.56,
  "qwen3-vl:2b": 0.95,
  "qwen3-vl:30b": 3.39,
  "qwen3-vl:32b": 7.75,
  "qwen3-vl:4b": 2.34,
  "qwen3-vl:8b": 3.38,
  "bge-m3:567m": 0.36,
  "embeddinggemma:300m": 0.35,
  "granite-embedding:278m": 0.31,
  "qwen3-embedding:0.6b": 0.57,
  "qwen3-embedding:4b": 0.57,
  "qwen3-embedding:8b": 0.57,
  "granite3-guardian:2b": 0.65,
  "granite3-guardian:8b": 3.09,
  "translategemma:12b": 4.87,
  "translategemma:27b": 7.84,
  "translategemma:4b": 1.25,
};

export function isCloudTempleBaseUrl(baseUrl?: string | null) {
  if (!baseUrl) return false;
  try {
    return (
      new URL(baseUrl).hostname.toLowerCase() === "api.ai.cloud-temple.com"
    );
  } catch {
    return false;
  }
}

export function enrichCloudTempleModel(
  model: ModelDescriptor,
): ModelDescriptor {
  const energyKwhPerMillionTokens =
    ENERGY_KWH_PER_MILLION_TOKENS[model.modelId];
  const isImageModel = model.modelId === "z-image:16b";
  return {
    ...model,
    capabilities: {
      ...model.capabilities,
      imageGeneration: isImageModel,
      text: isImageModel ? false : model.capabilities.text,
    },
    inputTokenCost: isImageModel ? undefined : "1.8",
    outputTokenCost: isImageModel ? undefined : "8",
    sustainability:
      energyKwhPerMillionTokens === undefined
        ? undefined
        : {
            energyKwhPerMillionTokens,
            source: CLOUD_TEMPLE_CATALOG_SOURCE,
            currency: "EUR",
          },
    imageGeneration: isImageModel
      ? {
          enabled: true,
          isDefault: true,
          defaultSize: "1024x1024",
          allowedSizes: ["1024x1024"],
          currency: "EUR",
        }
      : undefined,
  };
}
