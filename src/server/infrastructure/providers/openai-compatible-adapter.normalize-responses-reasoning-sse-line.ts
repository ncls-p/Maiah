import type {
ProviderRuntimeConfig
} from "./adapter";
import {
normalizeResponsesInputForCompatibleProvider,
parseRequestUrl,
} from "./openai-compatible-adapter.default-capabilities";

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
