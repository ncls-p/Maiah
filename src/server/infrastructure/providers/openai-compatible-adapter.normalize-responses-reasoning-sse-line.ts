import type { ProviderRuntimeConfig } from "./adapter";
import {
  normalizeResponsesInputForCompatibleProvider,
  parseRequestUrl,
} from "./openai-compatible-adapter.default-capabilities";

function shouldRetryWithCompatibleResponsesInput(
  response: Response,
  errorBody: string,
) {
  if (![400, 422, 500].includes(response.status)) return false;
  const normalizedError = errorBody.toLowerCase();
  return (
    normalizedError.includes("item_reference") ||
    (normalizedError.includes("input should be a valid string") &&
      normalizedError.includes("string_type")) ||
    normalizedError.includes("'role'") ||
    (normalizedError.includes("cannot determine type") &&
      normalizedError.includes("item"))
  );
}

const RESPONSES_REASONING_EVENT_ALIASES = {
  "response.reasoning_part.added": "response.reasoning_summary_part.added",
  "response.reasoning_text.delta": "response.reasoning_summary_text.delta",
  "response.reasoning_part.done": "response.reasoning_summary_part.done",
} as const;

const RESPONSES_INDEXED_ITEM_EVENTS = new Set([
  "response.output_text.delta",
  "response.output_text.done",
  "response.content_part.added",
  "response.content_part.done",
  "response.function_call_arguments.delta",
  "response.function_call_arguments.done",
]);

function requestModelFromBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") return undefined;
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    return typeof payload.model === "string" && payload.model
      ? payload.model
      : undefined;
  } catch {
    return undefined;
  }
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Build a stateful line normalizer for OpenAI-compatible Responses streams.
 *
 * Several otherwise-compatible providers omit fields required by strict
 * clients such as `@ai-sdk/openai`. Keep their item lifecycle correlated while
 * preserving valid provider fields and unrelated SSE lines.
 */
export function createResponsesSseLineNormalizer(
  modelId?: string,
  synthesizeMissingStarts = true,
) {
  const outputIndexes = new Map<string, number>();
  const startedItemIds = new Set<string>();
  let nextOutputIndex = 0;

  function resolveOutputIndex(itemId: unknown, explicitIndex: unknown) {
    if (isInteger(explicitIndex)) {
      if (typeof itemId === "string" && itemId) {
        outputIndexes.set(itemId, explicitIndex);
      }
      nextOutputIndex = Math.max(nextOutputIndex, explicitIndex + 1);
      return explicitIndex;
    }
    if (typeof itemId === "string" && itemId) {
      const existingIndex = outputIndexes.get(itemId);
      if (existingIndex !== undefined) return existingIndex;
    }
    const outputIndex = nextOutputIndex;
    nextOutputIndex += 1;
    if (typeof itemId === "string" && itemId) {
      outputIndexes.set(itemId, outputIndex);
    }
    return outputIndex;
  }

  return (line: string) => {
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
    if (!data || data === "[DONE]") return line;

    try {
      const payload = JSON.parse(data) as Record<string, unknown>;
      const type = typeof payload.type === "string" ? payload.type : "";
      const normalizedType =
        RESPONSES_REASONING_EVENT_ALIASES[
          type as keyof typeof RESPONSES_REASONING_EVENT_ALIASES
        ];
      const effectiveType = normalizedType ?? type;
      let normalizedPayload: Record<string, unknown> = normalizedType
        ? {
            ...payload,
            type: normalizedType,
            summary_index: isInteger(payload.summary_index)
              ? payload.summary_index
              : isInteger(payload.content_index)
                ? payload.content_index
                : 0,
          }
        : payload;
      let syntheticStart: Record<string, unknown> | undefined;

      if (type === "response.created") {
        const response = payload.response;
        if (response && typeof response === "object") {
          const responseRecord = response as Record<string, unknown>;
          normalizedPayload = {
            ...normalizedPayload,
            response: {
              ...responseRecord,
              created_at: isInteger(responseRecord.created_at)
                ? responseRecord.created_at
                : Math.floor(Date.now() / 1000),
              model:
                typeof responseRecord.model === "string" && responseRecord.model
                  ? responseRecord.model
                  : modelId || "unknown",
            },
          };
        }
      } else if (
        type === "response.output_item.added" ||
        type === "response.output_item.done"
      ) {
        const item = payload.item;
        if (item && typeof item === "object") {
          const itemRecord = item as Record<string, unknown>;
          const normalizedItem = { ...itemRecord };
          if (
            itemRecord.type === "function_call" &&
            (typeof itemRecord.id !== "string" || !itemRecord.id) &&
            typeof itemRecord.call_id === "string" &&
            itemRecord.call_id
          ) {
            normalizedItem.id = itemRecord.call_id;
          }
          if (
            type === "response.output_item.added" &&
            (itemRecord.type === "message" ||
              itemRecord.type === "reasoning") &&
            itemRecord.content === null
          ) {
            normalizedItem.content = [];
          }
          if (
            type === "response.output_item.added" &&
            itemRecord.type === "reasoning" &&
            itemRecord.summary === null
          ) {
            normalizedItem.summary = [];
          }
          const outputIndex = resolveOutputIndex(
            normalizedItem.id,
            payload.output_index,
          );
          if (
            type === "response.output_item.added" &&
            typeof normalizedItem.id === "string"
          ) {
            startedItemIds.add(normalizedItem.id);
          }
          normalizedPayload = {
            ...normalizedPayload,
            output_index: outputIndex,
            item: normalizedItem,
          };
        }
      } else if (RESPONSES_INDEXED_ITEM_EVENTS.has(type)) {
        const outputIndex = resolveOutputIndex(
          payload.item_id,
          payload.output_index,
        );
        normalizedPayload = {
          ...normalizedPayload,
          output_index: outputIndex,
        };
        if (
          synthesizeMissingStarts &&
          type === "response.output_text.delta" &&
          typeof payload.item_id === "string" &&
          !startedItemIds.has(payload.item_id)
        ) {
          startedItemIds.add(payload.item_id);
          syntheticStart = {
            type: "response.output_item.added",
            output_index: outputIndex,
            item: {
              type: "message",
              id: payload.item_id,
              role: "assistant",
              status: "in_progress",
              content: [],
            },
          };
        }
      }

      if (
        synthesizeMissingStarts &&
        effectiveType === "response.reasoning_summary_text.delta" &&
        typeof payload.item_id === "string" &&
        !startedItemIds.has(payload.item_id)
      ) {
        const outputIndex = resolveOutputIndex(
          payload.item_id,
          payload.output_index,
        );
        startedItemIds.add(payload.item_id);
        syntheticStart = {
          type: "response.output_item.added",
          output_index: outputIndex,
          item: {
            type: "reasoning",
            id: payload.item_id,
            encrypted_content: null,
            content: [],
            summary: [],
            status: "in_progress",
          },
        };
      }

      const normalizedLine =
        normalizedPayload === payload
          ? line
          : `data: ${JSON.stringify(normalizedPayload)}`;
      return syntheticStart
        ? `data: ${JSON.stringify(syntheticStart)}\n\nevent: ${effectiveType}\n${normalizedLine}`
        : normalizedLine;
    } catch {
      return line;
    }
  };
}

export function normalizeResponsesReasoningSseLine(line: string) {
  return createResponsesSseLineNormalizer(undefined, false)(line);
}

function normalizeResponsesReasoningStream(
  response: Response,
  requestModel?: string,
) {
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  ) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const normalizeLine = createResponsesSseLineNormalizer(requestModel);
  let buffer = "";
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${normalizeLine(line)}\n`));
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer) {
          controller.enqueue(encoder.encode(normalizeLine(buffer)));
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

export function createResponsesFetch(config: ProviderRuntimeConfig) {
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
    const requestModel = requestModelFromBody(requestInit.body);
    const response = await fetchImplementation(url, requestInit);
    if (response.ok) {
      return normalizeResponsesReasoningStream(response, requestModel);
    }

    const fallbackBody = normalizeResponsesInputForCompatibleProvider(
      requestInit.body,
    );
    if (fallbackBody === requestInit.body) return response;

    const errorBody = await response.clone().text();
    if (!shouldRetryWithCompatibleResponsesInput(response, errorBody)) {
      return response;
    }

    const fallbackResponse = await fetchImplementation(url, {
      ...requestInit,
      body: fallbackBody,
    });
    return normalizeResponsesReasoningStream(fallbackResponse, requestModel);
  };
}
