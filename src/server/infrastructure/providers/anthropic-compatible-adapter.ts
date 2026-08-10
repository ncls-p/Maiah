import { createAnthropic } from "@ai-sdk/anthropic";
import type {
  ModelDescriptor,
  ProviderAdapter,
  ProviderHealth,
  ProviderRuntimeConfig,
} from "./adapter";

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

function normalizeAnthropicBaseUrl(baseUrl?: string) {
  const normalized = (baseUrl || DEFAULT_ANTHROPIC_BASE_URL).replace(
    /\/+$/,
    "",
  );
  return normalized === "https://api.anthropic.com"
    ? DEFAULT_ANTHROPIC_BASE_URL
    : normalized;
}

function buildAnthropicHeaders(config: ProviderRuntimeConfig) {
  const headers: Record<string, string> = {
    "anthropic-version": "2023-06-01",
    ...config.headers,
  };
  if (config.apiKey) {
    if (config.authType === "bearer" || config.authType === "gateway") {
      headers.Authorization = `Bearer ${config.apiKey}`;
    } else if (
      !Object.keys(headers).some((key) => key.toLowerCase() === "x-api-key")
    ) {
      headers["x-api-key"] = config.apiKey;
    }
  }
  return headers;
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error("The Anthropic-compatible provider URL is invalid.");
  }
}

function createAnthropicFetch(config: ProviderRuntimeConfig) {
  if (!config.queryParams || Object.keys(config.queryParams).length === 0) {
    return undefined;
  }
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : undefined;
    const url = safeUrl(
      request?.url ?? (input instanceof URL ? input.href : String(input)),
    );
    for (const [key, value] of Object.entries(config.queryParams ?? {})) {
      url.searchParams.set(key, value);
    }
    return request
      ? fetch(new Request(url, request), init)
      : fetch(url, init);
  };
}

function createConfiguredAnthropic(config: ProviderRuntimeConfig) {
  const usesBearerToken =
    config.authType === "bearer" || config.authType === "gateway";
  return createAnthropic({
    name: config.name || "anthropic-compatible",
    baseURL: normalizeAnthropicBaseUrl(config.baseUrl),
    ...(usesBearerToken
      ? { authToken: config.apiKey }
      : { apiKey: config.apiKey || "anthropic-compatible-no-api-key" }),
    headers: config.headers,
    fetch: createAnthropicFetch(config),
  });
}

function parseAnthropicModels(payload: unknown): ModelDescriptor[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id) return [];
    return [
      {
        modelId: record.id,
        displayName:
          typeof record.display_name === "string"
            ? record.display_name
            : record.id,
        hostedBy: "Anthropic",
        capabilities: {
          text: true,
          vision: true,
          tools: true,
          reasoning: true,
          embeddings: false,
          audio: false,
          imageGeneration: false,
        },
      },
    ];
  });
}

async function fetchAnthropicModels(config: ProviderRuntimeConfig) {
  const url = safeUrl(`${normalizeAnthropicBaseUrl(config.baseUrl)}/models`);
  for (const [key, value] of Object.entries(config.queryParams ?? {})) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: buildAnthropicHeaders(config),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to list models: HTTP ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

export const anthropicCompatibleAdapter: ProviderAdapter = {
  kind: "anthropic-compatible",

  async validateConnection(config): Promise<ProviderHealth> {
    const startedAt = Date.now();
    try {
      await fetchAnthropicModels(config);
      return {
        status: "healthy",
        message: "Connected successfully",
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: (error as Error).message,
        latencyMs: Date.now() - startedAt,
      };
    }
  },

  async listModels(config) {
    return parseAnthropicModels(await fetchAnthropicModels(config));
  },

  createChatModel(config, modelId) {
    return createConfiguredAnthropic(config)(modelId);
  },

  createEmbeddingModel() {
    throw new Error(
      "Anthropic-compatible providers do not support embeddings.",
    );
  },
};
