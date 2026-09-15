import { createGateway } from "ai";
import { parseGatewayCatalog } from "./gateway-catalog";
import { logger } from "@/lib/logger";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModelV4, LanguageModelV4 } from "@ai-sdk/provider";
import type {
  ModelDescriptor,
  ProviderAdapter,
  ProviderHealth,
  ProviderRuntimeConfig,
} from "./adapter";
import { validateModelsEndpoint } from "./adapter-health";

const GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

function normalizeBaseUrl(baseUrl?: string): string {
  const base = baseUrl?.replace(/\/+$/, "") || GATEWAY_BASE_URL;
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

function gatewayHeaders(config: ProviderRuntimeConfig) {
  const headers: Record<string, string> = { ...config.headers };
  const usesBearerAuth = ["gateway", "bearer"].includes(config.authType);

  if (usesBearerAuth && config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  return headers;
}

export const vercelAiGatewayAdapter: ProviderAdapter = {
  kind: "vercel-ai-gateway",

  async validateConnection(
    config: ProviderRuntimeConfig,
  ): Promise<ProviderHealth> {
    return validateModelsEndpoint(
      config,
      normalizeBaseUrl(config.baseUrl),
      gatewayHeaders(config),
    );
  },

  async listModels(config: ProviderRuntimeConfig): Promise<ModelDescriptor[]> {
    try {
      const res = await fetch(`${normalizeBaseUrl(config.baseUrl)}/models`, {
        headers: gatewayHeaders(config),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        throw new Error(`Failed to list models: HTTP ${res.status}`);
      }

      return parseGatewayCatalog(await res.json());
    } catch (error) {
      logger.error(
        "Failed to list Vercel AI Gateway models",
        {},
        error as Error,
      );
      throw error;
    }
  },

  createChatModel(
    config: ProviderRuntimeConfig,
    modelId: string,
  ): LanguageModelV4 {
    const headers: Record<string, string> = { ...config.headers };

    if (config.authType === "gateway" && config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    } else if (config.authType === "bearer" && config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const provider = createOpenAICompatible({
      name: "vercel-ai-gateway",
      apiKey: config.apiKey,
      baseURL: normalizeBaseUrl(config.baseUrl),
      headers,
      queryParams: config.queryParams,
      includeUsage: true,
    });

    // Model IDs in gateway format: openai/gpt-4o, anthropic/claude-3.5-sonnet, etc.
    return provider.chatModel(modelId);
  },

  createImageModel(config, modelId) {
    if (!config.apiKey?.trim())
      throw new Error("Gateway API key required for image generation");
    return createGateway({
      apiKey: config.apiKey,
      baseURL: normalizeBaseUrl(config.baseUrl).replace(/\/v1$/, "/v4/ai"),
      headers: gatewayHeaders(config),
    }).imageModel(modelId);
  },

  createEmbeddingModel(
    config: ProviderRuntimeConfig,
    modelId: string,
  ): EmbeddingModelV4 {
    const provider = createOpenAICompatible({
      name: "vercel-ai-gateway",
      apiKey: config.apiKey,
      baseURL: normalizeBaseUrl(config.baseUrl),
      headers: gatewayHeaders(config),
      queryParams: config.queryParams,
    });
    return provider.embeddingModel(modelId);
  },
};
