import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import { enrichCloudTempleModel,isCloudTempleBaseUrl } from "@/modules/provider/cloud-temple-catalog";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModelV4,LanguageModelV4 } from "@ai-sdk/provider";
import type { ModelDescriptor,ProviderAdapter,ProviderHealth,ProviderRuntimeConfig } from "./adapter";
import { buildHeaders,createCompatibleRerankingModel,normalizeBaseUrl } from "./openai-compatible-adapter.default-capabilities";
import { createResponsesFetch } from "./openai-compatible-adapter.normalize-responses-reasoning-sse-line";
import { parseModels } from "./openai-compatible-adapter.parse-models";

export const openaiCompatibleAdapter: ProviderAdapter = {
  kind: "openai-compatible",

  async validateConnection(config: ProviderRuntimeConfig): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const baseUrl = normalizeBaseUrl(config.baseUrl);
      const headers = buildHeaders(config);

      const res = await fetch(`${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return {
          status: "unhealthy",
          message: `HTTP ${res.status}: ${res.statusText}`,
          latencyMs: Date.now() - start,
        };
      }

      return {
        status: "healthy",
        message: "Connected successfully",
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        status: "unhealthy",
        message: (err as Error).message,
        latencyMs: Date.now() - start,
      };
    }
  },

  async listModels(config: ProviderRuntimeConfig): Promise<ModelDescriptor[]> {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const headers = buildHeaders(config);

    const res = await fetch(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Failed to list models: HTTP ${res.status}`);
    }

    const data = (await res.json()) as unknown;
    const models = parseModels(data);
    return isCloudTempleBaseUrl(config.baseUrl) ? models.map(enrichCloudTempleModel) : models;
  },

  createChatModel(config: ProviderRuntimeConfig, modelId: string): LanguageModelV4 {
    if (normalizeOpenAICompatibleApiRoute(config.openaiCompatibleApiRoute) === "responses") {
      const provider = createOpenAI({
        name: config.name || "openai-compatible",
        apiKey: config.apiKey || "openai-compatible-no-api-key",
        baseURL: normalizeBaseUrl(config.baseUrl),
        headers: buildHeaders(config),
        fetch: createResponsesFetch(config),
      });

      return provider.responses(modelId);
    }

    const provider = createOpenAICompatible({
      name: config.name || "openai-compatible",
      apiKey: config.apiKey,
      baseURL: normalizeBaseUrl(config.baseUrl),
      headers: buildHeaders(config),
      queryParams: config.queryParams,
      includeUsage: true,
      // Forward OpenAI response_format JSON schemas. Providers that do not
      // implement Structured Outputs will reject the request explicitly.
      supportsStructuredOutputs: true,
    });

    return provider.chatModel(modelId);
  },

  createImageModel(config: ProviderRuntimeConfig, modelId: string) {
    const provider = createOpenAICompatible({
      name: config.name || "openai-compatible",
      apiKey: config.authType === "bearer" ? config.apiKey : undefined,
      baseURL: normalizeBaseUrl(config.baseUrl),
      headers: buildHeaders(config),
      queryParams: config.queryParams,
    });
    return provider.imageModel(modelId);
  },

  createEmbeddingModel(config: ProviderRuntimeConfig, modelId: string): EmbeddingModelV4 {
    const provider = createOpenAICompatible({
      name: config.name,
      apiKey: config.apiKey,
      baseURL: normalizeBaseUrl(config.baseUrl),
      headers: buildHeaders(config),
      queryParams: config.queryParams,
    });
    return provider.embeddingModel(modelId);
  },

  createRerankingModel(config, modelId) {
    return createCompatibleRerankingModel(config, modelId);
  },
};
