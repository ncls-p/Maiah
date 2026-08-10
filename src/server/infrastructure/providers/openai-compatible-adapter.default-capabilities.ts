import type {
  RerankingModelV4,
  RerankingModelV4CallOptions,
  RerankingModelV4Result,
} from "@ai-sdk/provider";
import type { ModelCapability, ProviderRuntimeConfig } from "./adapter";

export const DEFAULT_CAPABILITIES: ModelCapability = {
  text: true,
  vision: false,
  tools: false,
  reasoning: false,
  embeddings: false,
  audio: false,
  imageGeneration: false,
};

export function normalizeBaseUrl(baseUrl?: string): string {
  return baseUrl?.replace(/\/+$/, "") || "https://api.openai.com/v1";
}

export function parseRequestUrl(input: RequestInfo | URL): URL | undefined {
  let value: string;
  if (input instanceof URL) {
    value = input.href;
  } else if (typeof input === "string") {
    value = input;
  } else {
    value = input.url;
  }

  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function buildHeaders(
  config: ProviderRuntimeConfig,
): Record<string, string> {
  const headers: Record<string, string> = { ...config.headers };

  switch (config.authType) {
    case "bearer":
      if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      }
      break;
    case "x-api-key":
      if (config.apiKey) {
        headers["X-API-KEY"] = config.apiKey;
      }
      break;
    case "custom-header":
      // Custom headers already in config.headers
      break;
    default:
      break;
  }

  return headers;
}

export function createCompatibleRerankingModel(
  config: ProviderRuntimeConfig,
  modelId: string,
): RerankingModelV4 {
  return {
    specificationVersion: "v4",
    provider: config.name,
    modelId,
    async doRerank(
      options: RerankingModelV4CallOptions,
    ): Promise<RerankingModelV4Result> {
      const response = await fetch(
        `${normalizeBaseUrl(config.baseUrl)}/rerank`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildHeaders(config),
            ...options.headers,
          },
          body: JSON.stringify({
            model: modelId,
            query: options.query,
            documents: options.documents.values,
            top_n: options.topN,
          }),
          signal: options.abortSignal,
        },
      );
      const body = (await response.json()) as {
        id?: string;
        results?: Array<{
          index: number;
          relevance_score?: number;
          score?: number;
        }>;
        data?: Array<{
          index: number;
          relevance_score?: number;
          score?: number;
        }>;
        error?: { message?: string } | string;
      };
      if (!response.ok) {
        const message =
          typeof body.error === "string" ? body.error : body.error?.message;
        throw new Error(
          message || `Reranking failed with HTTP ${response.status}`,
        );
      }
      const results = body.results ?? body.data ?? [];
      return {
        ranking: results.map((result) => ({
          index: result.index,
          relevanceScore: result.relevance_score ?? result.score ?? 0,
        })),
        response: {
          id: body.id,
          timestamp: new Date(),
          modelId,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        },
      };
    },
  };
}

function compatibleResponsesMessage(item: unknown) {
  if (typeof item !== "object" || item === null) return item;
  const record = item as Record<string, unknown>;
  if (record.type === "item_reference") return null;
  if (
    record.role !== "assistant" ||
    !Array.isArray(record.content) ||
    !record.content.every(
      (part) =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
  ) {
    return item;
  }

  return {
    ...record,
    content: record.content
      .map((part) => (part as { text: string }).text)
      .join(""),
  };
}

export function normalizeResponsesInputForCompatibleProvider(
  body: BodyInit | null | undefined,
) {
  if (typeof body !== "string") return body;
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    if (!Array.isArray(payload.input)) return body;
    const input = payload.input
      .map(compatibleResponsesMessage)
      .filter((item) => item !== null);
    if (JSON.stringify(input) === JSON.stringify(payload.input)) return body;
    return JSON.stringify({ ...payload, input });
  } catch {
    return body;
  }
}

export const stripUnsupportedResponsesItemReferences =
  normalizeResponsesInputForCompatibleProvider;
