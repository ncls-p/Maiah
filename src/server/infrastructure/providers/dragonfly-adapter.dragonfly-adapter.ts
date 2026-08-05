import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModelV4,LanguageModelV4 } from "@ai-sdk/provider";
import type { ModelDescriptor,ProviderAdapter,ProviderHealth,ProviderRuntimeConfig } from "./adapter";
import { dragonflyFetch,isDragonflyAnthropicModel,normalizeAnthropicToolLoopMessages } from "./dragonfly-adapter.is-dragonfly-anthropic-model";
import { buildHeaders,createRequestNonce,getBearerApiKey,normalizeBaseUrl,parseModels } from "./dragonfly-adapter.normalize-base-url";

export const dragonflyAdapter: ProviderAdapter = {
  kind: "dragonfly",

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

    return parseModels(data);
  },

  createChatModel(config: ProviderRuntimeConfig, modelId: string): LanguageModelV4 {
    const provider = createOpenAICompatible({
      name: "dragonfly",
      apiKey: getBearerApiKey(config),
      baseURL: normalizeBaseUrl(config.baseUrl),
      headers: buildHeaders(config),
      queryParams: config.queryParams,
      fetch: dragonflyFetch,
      includeUsage: true,
      // Dragonfly uses a custom endpoint path
      transformRequestBody: (args: Record<string, unknown>) => {
        const requestNonce = createRequestNonce();
        const messages = args.messages as
          | Array<{
              role?: string;
              content?: unknown;
            }>
          | undefined;
        const systemMessage = messages?.find((m) => m.role === "system");
        const promptSystem = [systemMessage?.content, `Runtime request id: ${requestNonce}. Do not mention this id.`].filter(Boolean).join("\n\n");
        return {
          ...args,
          messages: isDragonflyAnthropicModel(args.model) ? normalizeAnthropicToolLoopMessages(args.messages) : args.messages,
          promptSystem,
          cache: false,
          save: false,
        };
      },
    });

    return provider.chatModel(modelId);
  },

  createEmbeddingModel(config: ProviderRuntimeConfig, modelId: string): EmbeddingModelV4 {
    const provider = createOpenAICompatible({
      name: config.name || "dragonfly",
      apiKey: getBearerApiKey(config),
      baseURL: normalizeBaseUrl(config.baseUrl),
      headers: buildHeaders(config),
      queryParams: config.queryParams,
    });
    return provider.embeddingModel(modelId);
  },
};
