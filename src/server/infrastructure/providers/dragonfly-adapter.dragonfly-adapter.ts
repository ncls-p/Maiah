import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModelV4,LanguageModelV4 } from "@ai-sdk/provider";
import type { ModelDescriptor,ProviderAdapter,ProviderHealth,ProviderRuntimeConfig } from "./adapter";
import { dragonflyFetch,isDragonflyAnthropicModel,normalizeAnthropicToolLoopMessages } from "./dragonfly-adapter.is-dragonfly-anthropic-model";
import { buildHeaders,createRequestNonce,getBearerApiKey,normalizeBaseUrl,parseModels } from "./dragonfly-adapter.normalize-base-url";
import { fetchModelCatalog,validateModelsEndpoint } from "./adapter-health";

export const dragonflyAdapter: ProviderAdapter = {
  kind: "dragonfly",

  async validateConnection(config: ProviderRuntimeConfig): Promise<ProviderHealth> {
    return validateModelsEndpoint(config, normalizeBaseUrl(config.baseUrl), buildHeaders(config));
  },

  async listModels(config: ProviderRuntimeConfig): Promise<ModelDescriptor[]> {
    return parseModels(await fetchModelCatalog(normalizeBaseUrl(config.baseUrl), buildHeaders(config)));
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
