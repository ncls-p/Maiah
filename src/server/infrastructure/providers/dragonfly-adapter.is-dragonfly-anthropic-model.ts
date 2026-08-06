import { removeInvalidThinkingToolCalls } from "./dragonfly-adapter.normalize-base-url";

function sanitizeDragonflySsePayload(payload: string) {
  if (!payload || payload === "[DONE]") return payload;
  try {
    return JSON.stringify(removeInvalidThinkingToolCalls(JSON.parse(payload)));
  } catch {
    return payload;
  }
}

function sanitizeDragonflySseEvent(eventText: string) {
  const lines = eventText.split("\n");
  return lines
    .map((line) => {
      if (!line.startsWith("data:")) return line;
      const prefix = line.match(/^data:\s*/)?.[0] ?? "data: ";
      const payload = line.slice(prefix.length);
      return `${prefix}${sanitizeDragonflySsePayload(payload)}`;
    })
    .join("\n");
}

type OpenAiCompatibleMessage = Record<string, unknown> & {
  role?: string;
  content?: unknown;
  tool_call_id?: unknown;
  tool_calls?: unknown;
  reasoning_content?: unknown;
};

export function isDragonflyAnthropicModel(model: unknown) {
  return typeof model === "string" && (model.includes("claude") || model.includes("anthropic"));
}

export function normalizeAnthropicToolLoopMessages(messages: unknown): OpenAiCompatibleMessage[] | unknown {
  if (!Array.isArray(messages)) return messages;

  return (messages as OpenAiCompatibleMessage[]).map((message) => {
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      const rest = { ...message };
      delete rest.reasoning_content;

      return {
        ...rest,
        // Dragonfly's Anthropic bridge rejects assistant prefill when the
        // assistant message also contains tool_calls. Keep the tool_use signal,
        // but remove generated text/reasoning from the replayed assistant turn.
        content: null,
      };
    }

    if (message.role === "tool") {
      return {
        role: "user",
        content: [`Tool result for ${String(message.tool_call_id ?? "unknown")}:`, typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? null), "Use this result to answer the user's request. Do not call the same tool again unless the result is insufficient."].join("\n"),
      };
    }

    return message;
  });
}

export async function dragonflyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.body || !contentType.includes("text/event-stream")) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        controller.enqueue(encoder.encode(`${sanitizeDragonflySseEvent(event)}\n\n`));
      }
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) {
        controller.enqueue(encoder.encode(sanitizeDragonflySseEvent(buffer)));
      }
    },
  });

  return new Response(response.body.pipeThrough(stream), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
