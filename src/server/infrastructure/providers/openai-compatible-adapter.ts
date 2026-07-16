import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import type {
  ProviderAdapter,
  ProviderRuntimeConfig,
  ProviderHealth,
  ModelDescriptor,
  ModelCapability,
} from "./adapter";

const DEFAULT_CAPABILITIES: ModelCapability = {
  text: true,
  vision: false,
  tools: false,
  reasoning: false,
  embeddings: false,
  audio: false,
};

function normalizeBaseUrl(baseUrl?: string): string {
  const base = baseUrl?.replace(/\/+$/, "") || "https://api.openai.com";
  return base.endsWith("/v1") ? base : `${base}/v1`;
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
  }

  return headers;
}

function createResponsesFetch(config: ProviderRuntimeConfig) {
  const fetchImplementation = globalThis.fetch;
  const hasExplicitAuthorizationHeader = Object.keys(config.headers ?? {}).some(
    (key) => key.toLowerCase() === "authorization",
  );

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(
      input instanceof URL
        ? input
        : typeof input === "string"
          ? input
          : input.url,
    );
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

    return fetchImplementation(url, {
      ...init,
      method: init?.method ?? request?.method,
      body: init?.body ?? request?.body,
      signal: init?.signal ?? request?.signal,
      headers,
    });
  };
}

type OpenAICompatibleModel = {
  // Official OpenAI Model object fields.
  id: string;
  object?: "model" | string;
  created?: number;
  owned_by?: string;

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

function toPositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && value > 0 ? value : undefined;
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
        model.meta?.n_ctx ?? model.meta?.n_ctx_train,
      ),
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
    return parseModels(data);
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
    });

    return provider.chatModel(modelId);
  },
};
