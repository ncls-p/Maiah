import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type {
  EmbeddingModelV4,
  LanguageModelV4,
  RerankingModelV4,
  RerankingModelV4CallOptions,
  RerankingModelV4Result,
} from "@ai-sdk/provider";
import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import type {
  ProviderAdapter,
  ProviderRuntimeConfig,
  ProviderHealth,
  ModelDescriptor,
  ModelCapability,
} from "./adapter";
import {
  enrichCloudTempleModel,
  isCloudTempleBaseUrl,
} from "@/modules/provider/cloud-temple-catalog";

const DEFAULT_CAPABILITIES: ModelCapability = {
  text: true,
  vision: false,
  tools: false,
  reasoning: false,
  embeddings: false,
  audio: false,
  imageGeneration: false,
};

function normalizeBaseUrl(baseUrl?: string): string {
  return baseUrl?.replace(/\/+$/, "") || "https://api.openai.com/v1";
}

function parseRequestUrl(input: RequestInfo | URL): URL | undefined {
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

function buildHeaders(config: ProviderRuntimeConfig): Record<string, string> {
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

function createCompatibleRerankingModel(
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

function isUnsupportedItemReferenceResponse(
  response: Response,
  errorBody: string,
) {
  if (![400, 422, 500].includes(response.status)) return false;
  const normalizedError = errorBody.toLowerCase();
  return (
    normalizedError.includes("item_reference") ||
    (normalizedError.includes("input should be a valid string") &&
      normalizedError.includes("string_type")) ||
    normalizedError.includes("'role'")
  );
}

const RESPONSES_REASONING_EVENT_ALIASES = {
  "response.reasoning_part.added": "response.reasoning_summary_part.added",
  "response.reasoning_text.delta": "response.reasoning_summary_text.delta",
  "response.reasoning_part.done": "response.reasoning_summary_part.done",
} as const;

export function normalizeResponsesReasoningSseLine(line: string) {
  if (line.startsWith("event:")) {
    const eventName = line.slice("event:".length).trim();
    const normalizedEvent =
      RESPONSES_REASONING_EVENT_ALIASES[
        eventName as keyof typeof RESPONSES_REASONING_EVENT_ALIASES
      ];
    return normalizedEvent ? `event: ${normalizedEvent}` : line;
  }
  if (!line.startsWith("data:")) return line;

  const data = line.slice("data:".length).trim();
  try {
    const payload = JSON.parse(data) as Record<string, unknown>;
    const type = typeof payload.type === "string" ? payload.type : "";
    const normalizedType =
      RESPONSES_REASONING_EVENT_ALIASES[
        type as keyof typeof RESPONSES_REASONING_EVENT_ALIASES
      ];
    if (!normalizedType) return line;
    return `data: ${JSON.stringify({
      ...payload,
      type: normalizedType,
      summary_index:
        typeof payload.content_index === "number" ? payload.content_index : 0,
    })}`;
  } catch {
    return line;
  }
}

function normalizeResponsesReasoningStream(response: Response) {
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  ) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          controller.enqueue(
            encoder.encode(`${normalizeResponsesReasoningSseLine(line)}\n`),
          );
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer) {
          controller.enqueue(
            encoder.encode(normalizeResponsesReasoningSseLine(buffer)),
          );
        }
      },
    }),
  );

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function createResponsesFetch(config: ProviderRuntimeConfig) {
  const fetchImplementation = globalThis.fetch;
  const hasExplicitAuthorizationHeader = Object.keys(config.headers ?? {}).some(
    (key) => key.toLowerCase() === "authorization",
  );

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = input instanceof Request ? input : undefined;
    const url = parseRequestUrl(input);
    if (!url) {
      return Promise.reject(
        new Error("The provider generated an invalid request URL."),
      );
    }
    for (const [key, value] of Object.entries(config.queryParams ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers = new Headers(request?.headers);
    new Headers(init?.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    if (
      !hasExplicitAuthorizationHeader &&
      (config.authType !== "bearer" || !config.apiKey)
    ) {
      headers.delete("authorization");
    }

    const requestInit: RequestInit = {
      ...init,
      method: init?.method ?? request?.method,
      body: init?.body ?? request?.body,
      signal: init?.signal ?? request?.signal,
      headers,
    };
    const response = await fetchImplementation(url, requestInit);
    if (response.ok) {
      return normalizeResponsesReasoningStream(response);
    }

    const fallbackBody = normalizeResponsesInputForCompatibleProvider(
      requestInit.body,
    );
    if (fallbackBody === requestInit.body) return response;

    const errorBody = await response.clone().text();
    if (!isUnsupportedItemReferenceResponse(response, errorBody)) {
      return response;
    }

    const fallbackResponse = await fetchImplementation(url, {
      ...requestInit,
      body: fallbackBody,
    });
    return normalizeResponsesReasoningStream(fallbackResponse);
  };
}

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

function parseModels(data: unknown): ModelDescriptor[] {
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

export const openaiCompatibleAdapter: ProviderAdapter = {
  kind: "openai-compatible",

  async validateConnection(
    config: ProviderRuntimeConfig,
  ): Promise<ProviderHealth> {
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
    return isCloudTempleBaseUrl(config.baseUrl)
      ? models.map(enrichCloudTempleModel)
      : models;
  },

  createChatModel(
    config: ProviderRuntimeConfig,
    modelId: string,
  ): LanguageModelV4 {
    if (
      normalizeOpenAICompatibleApiRoute(config.openaiCompatibleApiRoute) ===
      "responses"
    ) {
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

  createEmbeddingModel(
    config: ProviderRuntimeConfig,
    modelId: string,
  ): EmbeddingModelV4 {
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
