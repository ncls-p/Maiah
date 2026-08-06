import type { ModelCapability,ModelDescriptor,ProviderRuntimeConfig } from "./adapter";

const DEFAULT_CAPABILITIES: ModelCapability = {
  text: true,
  vision: false,
  tools: false,
  reasoning: false,
  embeddings: false,
  audio: false,
  imageGeneration: false,
};

export function normalizeBaseUrl(baseUrl?: string): string {
  const base = baseUrl?.replace(/\/+$/, "") || "https://api.dragonfly.dev";
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

export function buildHeaders(config: ProviderRuntimeConfig): Record<string, string> {
  const headers: Record<string, string> = { ...config.headers };

  switch (config.authType) {
    case "bearer":
    case "gateway":
      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }
      break;
    case "x-api-key":
      if (config.apiKey) {
        headers["X-API-KEY"] = config.apiKey;
      }
      break;
    case "custom-header":
      // Custom headers are already in config.headers.
      break;
  }

  return headers;
}

type OpenAiModel = {
  id: string;
};

type DragonflyModel = {
  id?: number;
  name?: string;
  displayName?: string;
  description?: string | null;
  max_token?: number | null;
  context_window?: number | null;
  imageProcessing?: boolean;
  toolsAvailable?: boolean;
  isReasoning?: boolean;
  inputTokenPrice?: number | string | null;
  outputTokenPrice?: number | string | null;
};

type DragonflyModelGroup = {
  host?: string;
  models?: DragonflyModel[];
};

function toPositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function hasOpenAiModelData(data: unknown): data is { data: OpenAiModel[] } {
  if (typeof data !== "object" || data === null || !("data" in data)) {
    return false;
  }

  return Array.isArray(data.data);
}

function parseOpenAiModels(data: unknown): ModelDescriptor[] {
  if (!hasOpenAiModelData(data)) {
    return [];
  }

  return data.data
    .filter((model) => typeof model.id === "string")
    .map((model) => ({
      modelId: model.id,
      displayName: model.id,
      capabilities: { ...DEFAULT_CAPABILITIES },
    }));
}

function parseDragonflyModels(data: unknown): ModelDescriptor[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return (data as DragonflyModelGroup[]).flatMap((group) =>
    (group.models ?? [])
      .filter((model) => typeof model.name === "string" && model.name.length > 0)
      .map((model) => ({
        modelId: model.name as string,
        displayName: model.displayName ?? model.name,
        description: model.description ?? undefined,
        hostedBy: group.host,
        capabilities: {
          ...DEFAULT_CAPABILITIES,
          vision: Boolean(model.imageProcessing),
          tools: Boolean(model.toolsAvailable),
          reasoning: Boolean(model.isReasoning),
        },
        contextWindow: toPositiveNumber(model.context_window),
        maxOutputTokens: toPositiveNumber(model.max_token),
        inputTokenCost: model.inputTokenPrice == null ? undefined : String(model.inputTokenPrice),
        outputTokenCost: model.outputTokenPrice == null ? undefined : String(model.outputTokenPrice),
      })),
  );
}

export function parseModels(data: unknown): ModelDescriptor[] {
  const openAiModels = parseOpenAiModels(data);
  if (openAiModels.length > 0) {
    return openAiModels;
  }

  return parseDragonflyModels(data);
}

export function getBearerApiKey(config: ProviderRuntimeConfig) {
  return ["bearer", "gateway"].includes(config.authType) ? config.apiKey : undefined;
}

export function createRequestNonce() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type DragonflyToolCallContainer = {
  tool_calls?: Array<Record<string, unknown>>;
  tool_calls_index?: unknown;
};

type DragonflyChatChunk = {
  choices?: Array<{
    delta?: DragonflyToolCallContainer;
    message?: DragonflyToolCallContainer;
  }>;
};

function hasOpenAiFunction(toolCall: Record<string, unknown>) {
  return typeof toolCall.function === "object" && toolCall.function !== null;
}

export function removeInvalidThinkingToolCalls(chunk: DragonflyChatChunk) {
  for (const choice of chunk.choices ?? []) {
    for (const container of [choice.delta, choice.message]) {
      if (!container?.tool_calls) continue;
      // Dragonfly streams Anthropic content blocks as OpenAI `tool_calls`
      // entries like `{ type: "thinking" }` or `{ type: "text" }`, without
      // the required OpenAI `function` object. The AI SDK correctly rejects
      // those. Reasoning/text content is already exposed via `reasoning_content`
      // and `content`, so drop only non-function tool-call shims.
      const validToolCalls = container.tool_calls.filter(hasOpenAiFunction);
      if (validToolCalls.length > 0) {
        container.tool_calls = validToolCalls;
      } else {
        delete container.tool_calls;
        delete container.tool_calls_index;
      }
    }
  }
  return chunk;
}
