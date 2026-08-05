import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";

import type { AnthropicMessagesRequest } from "@/modules/anthropic-proxy/contracts";
import { anthropicErrorBody } from "@/modules/anthropic-proxy/errors";
import {
  anthropicStopReason,
  createAnthropicMessageId,
} from "@/modules/anthropic-proxy/response-builders";
import { OpenAIProxyError, providerError } from "@/modules/openai-proxy/errors";

type StreamResult = { stream: AsyncIterable<TextStreamPart<ToolSet>> };
type StreamCallbacks = {
  onComplete: (usage: LanguageModelUsage) => void | Promise<void>;
  onError: (error: OpenAIProxyError) => void | Promise<void>;
};

const encoder = new TextEncoder();

function event(type: string, payload: unknown) {
  return encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function streamHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export function createAnthropicMessagesStream(input: {
  request: AnthropicMessagesRequest;
  result: StreamResult;
  requestId: string;
  callbacks: StreamCallbacks;
}) {
  const messageId = createAnthropicMessageId();
  const toolIndexes = new Map<string, number>();
  let textIndex: number | undefined;
  let nextIndex = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        event("message_start", {
          type: "message_start",
          message: {
            id: messageId,
            type: "message",
            role: "assistant",
            model: input.request.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        }),
      );
      try {
        for await (const part of input.result.stream) {
          if (part.type === "text-delta") {
            if (textIndex === undefined) {
              textIndex = nextIndex++;
              controller.enqueue(
                event("content_block_start", {
                  type: "content_block_start",
                  index: textIndex,
                  content_block: { type: "text", text: "" },
                }),
              );
            }
            controller.enqueue(
              event("content_block_delta", {
                type: "content_block_delta",
                index: textIndex,
                delta: { type: "text_delta", text: part.text },
              }),
            );
          } else if (part.type === "tool-input-start") {
            const index = nextIndex++;
            toolIndexes.set(part.id, index);
            controller.enqueue(
              event("content_block_start", {
                type: "content_block_start",
                index,
                content_block: {
                  type: "tool_use",
                  id: part.id,
                  name: part.toolName,
                  input: {},
                },
              }),
            );
          } else if (part.type === "tool-input-delta") {
            const index = toolIndexes.get(part.id);
            if (index === undefined) continue;
            controller.enqueue(
              event("content_block_delta", {
                type: "content_block_delta",
                index,
                delta: { type: "input_json_delta", partial_json: part.delta },
              }),
            );
          } else if (part.type === "tool-call") {
            if (!toolIndexes.has(part.toolCallId)) {
              const index = nextIndex++;
              toolIndexes.set(part.toolCallId, index);
              controller.enqueue(
                event("content_block_start", {
                  type: "content_block_start",
                  index,
                  content_block: {
                    type: "tool_use",
                    id: part.toolCallId,
                    name: part.toolName,
                    input: part.input ?? {},
                  },
                }),
              );
            }
          } else if (part.type === "error") {
            throw part.error;
          } else if (part.type === "abort") {
            throw new OpenAIProxyError(
              part.reason || "The request was cancelled.",
              499,
              "invalid_request_error",
              "request_cancelled",
            );
          } else if (part.type === "finish") {
            if (textIndex !== undefined) {
              controller.enqueue(
                event("content_block_stop", {
                  type: "content_block_stop",
                  index: textIndex,
                }),
              );
            }
            for (const index of toolIndexes.values()) {
              controller.enqueue(
                event("content_block_stop", {
                  type: "content_block_stop",
                  index,
                }),
              );
            }
            controller.enqueue(
              event("message_delta", {
                type: "message_delta",
                delta: {
                  stop_reason: anthropicStopReason(part.finishReason),
                  stop_sequence: null,
                },
                usage: { output_tokens: part.totalUsage.outputTokens ?? 0 },
              }),
            );
            await input.callbacks.onComplete(part.totalUsage);
            controller.enqueue(event("message_stop", { type: "message_stop" }));
            controller.close();
            return;
          }
        }
        throw new Error("The upstream stream ended without a finish event.");
      } catch (error) {
        const normalized = providerError(error);
        await input.callbacks.onError(normalized);
        controller.enqueue(
          event("error", anthropicErrorBody(normalized, input.requestId)),
        );
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: streamHeaders() });
}
