import type { OpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import type {
  ImageGenerationConfig,
  SustainabilityConfig,
} from "@/modules/provider/model-runtime-config";
import type {
  EmbeddingModelV4,
  ImageModelV4,
  LanguageModelV4,
  RerankingModelV4,
} from "@ai-sdk/provider";

export type ProviderKind =
  "openai-compatible" | "dragonfly" | "vercel-ai-gateway" | "native";

type ProviderAuthType = "bearer" | "x-api-key" | "custom-header" | "gateway";

export interface ModelCapability {
  text: boolean;
  vision: boolean;
  tools: boolean;
  reasoning: boolean;
  embeddings: boolean;
  audio: boolean;
  imageGeneration: boolean;
}

export interface ModelDescriptor {
  modelId: string;
  displayName?: string;
  description?: string;
  hostedBy?: string;
  capabilities: ModelCapability;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputTokenCost?: string;
  outputTokenCost?: string;
  imageGeneration?: ImageGenerationConfig;
  sustainability?: SustainabilityConfig;
}

export interface ProviderHealth {
  status: "healthy" | "unhealthy" | "unknown";
  message?: string;
  latencyMs?: number;
}

export interface ProviderRuntimeConfig {
  kind: ProviderKind;
  name: string;
  baseUrl?: string;
  authType: ProviderAuthType;
  apiKey?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  openaiCompatibleApiRoute?: OpenAICompatibleApiRoute;
}

export interface ProviderAdapter {
  kind: ProviderKind;
  validateConnection(config: ProviderRuntimeConfig): Promise<ProviderHealth>;
  listModels?(config: ProviderRuntimeConfig): Promise<ModelDescriptor[]>;
  createChatModel(
    config: ProviderRuntimeConfig,
    modelId: string,
  ): LanguageModelV4;
  createEmbeddingModel(
    config: ProviderRuntimeConfig,
    modelId: string,
  ): EmbeddingModelV4;
  createRerankingModel?(
    config: ProviderRuntimeConfig,
    modelId: string,
  ): RerankingModelV4;
  createImageModel?(
    config: ProviderRuntimeConfig,
    modelId: string,
  ): ImageModelV4;
}
