import type { LanguageModelUsage,TextStreamPart,ToolSet } from "ai";

import type { ChatCompletionRequest } from "@/modules/openai-proxy/contracts";
import { openAIErrorBody,OpenAIProxyError,providerError } from "@/modules/openai-proxy/errors";
import { chatFinishReason,chatUsage,createChatCompletionId } from "@/modules/openai-proxy/response-builders";

export type ProxyStreamResult = {
  stream: AsyncIterable<TextStreamPart<ToolSet>>;
};

export type StreamCallbacks = {
  onComplete: (usage: LanguageModelUsage) => void | Promise<void>;
  onError: (error: OpenAIProxyError) => void | Promise<void>;
};

const encoder = new TextEncoder();

function safeJson(value: unknown) {
  return JSON.stringify(value);
}

function sseData(value: unknown) {
  return encoder.encode(`data: ${safeJson(value)}\n\n`);
}

export function sseEvent(type: string, value: unknown) {
  return encoder.encode(`event: ${type}\ndata: ${safeJson(value)}\n\n`);
}

export function streamHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export function createChatCompletionStream(input: { request: ChatCompletionRequest; result: ProxyStreamResult; callbacks: StreamCallbacks }) {
  const id = createChatCompletionId();
  const created = Math.floor(Date.now() / 1000);
  const includeUsage = input.request.stream_options?.include_usage === true;
  const toolCalls = new Map<string, { index: number; name: string; arguments: string; started: boolean }>();
  let nextToolIndex = 0;

  const chunk = (delta: Record<string, unknown>, finishReason: string | null) => ({
    id,
    object: "chat.completion.chunk",
    created,
    model: input.request.model,
    choices: [
      {
        index: 0,
        delta,
        logprobs: null,
        finish_reason: finishReason,
      },
    ],
    ...(includeUsage ? { usage: null } : {}),
    system_fingerprint: null,
    service_tier: input.request.service_tier ?? "default",
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sseData(chunk({ role: "assistant", content: "" }, null)));
      try {
        for await (const part of input.result.stream) {
          switch (part.type) {
            case "text-delta":
              controller.enqueue(sseData(chunk({ content: part.text }, null)));
              break;
            case "tool-input-start": {
              const state = {
                index: nextToolIndex++,
                name: part.toolName,
                arguments: "",
                started: true,
              };
              toolCalls.set(part.id, state);
              controller.enqueue(
                sseData(
                  chunk(
                    {
                      tool_calls: [
                        {
                          index: state.index,
                          id: part.id,
                          type: "function",
                          function: { name: part.toolName, arguments: "" },
                        },
                      ],
                    },
                    null,
                  ),
                ),
              );
              break;
            }
            case "tool-input-delta": {
              const state = toolCalls.get(part.id);
              if (!state) break;
              state.arguments += part.delta;
              controller.enqueue(
                sseData(
                  chunk(
                    {
                      tool_calls: [
                        {
                          index: state.index,
                          function: { arguments: part.delta },
                        },
                      ],
                    },
                    null,
                  ),
                ),
              );
              break;
            }
            case "tool-call": {
              const serialized = JSON.stringify(part.input ?? {});
              const existing = toolCalls.get(part.toolCallId);
              if (!existing) {
                const index = nextToolIndex++;
                toolCalls.set(part.toolCallId, {
                  index,
                  name: part.toolName,
                  arguments: serialized,
                  started: true,
                });
                controller.enqueue(
                  sseData(
                    chunk(
                      {
                        tool_calls: [
                          {
                            index,
                            id: part.toolCallId,
                            type: "function",
                            function: {
                              name: part.toolName,
                              arguments: serialized,
                            },
                          },
                        ],
                      },
                      null,
                    ),
                  ),
                );
              } else if (!existing.arguments && serialized !== "{}") {
                existing.arguments = serialized;
                controller.enqueue(
                  sseData(
                    chunk(
                      {
                        tool_calls: [
                          {
                            index: existing.index,
                            function: { arguments: serialized },
                          },
                        ],
                      },
                      null,
                    ),
                  ),
                );
              }
              break;
            }
            case "error":
              throw part.error;
            case "abort":
              throw new OpenAIProxyError(part.reason || "The request was cancelled.", 499, "invalid_request_error", "request_cancelled");
            case "finish": {
              controller.enqueue(sseData(chunk({}, chatFinishReason(part.finishReason))));
              if (includeUsage) {
                controller.enqueue(
                  sseData({
                    id,
                    object: "chat.completion.chunk",
                    created,
                    model: input.request.model,
                    choices: [],
                    usage: chatUsage(part.totalUsage),
                    system_fingerprint: null,
                    service_tier: input.request.service_tier ?? "default",
                  }),
                );
              }
              await input.callbacks.onComplete(part.totalUsage);
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }
          }
        }
        throw new Error("The upstream stream ended without a finish event.");
      } catch (error) {
        const normalized = providerError(error);
        await input.callbacks.onError(normalized);
        controller.enqueue(sseData(openAIErrorBody(normalized)));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: streamHeaders() });
}
