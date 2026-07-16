import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";

import type {
  ChatCompletionRequest,
  ProxyResponseFormat,
  ResponsesRequest,
} from "@/modules/openai-proxy/contracts";
import {
  OpenAIProxyError,
  openAIErrorBody,
  providerError,
} from "@/modules/openai-proxy/errors";
import {
  chatFinishReason,
  chatUsage,
  createChatCompletionId,
  createFunctionItemId,
  createMessageId,
  createResponseId,
  responseCompletionState,
  responsesUsage,
  responseTextConfig,
  type ResponsesOutputItem,
} from "@/modules/openai-proxy/response-builders";

type ProxyStreamResult = {
  stream: AsyncIterable<TextStreamPart<ToolSet>>;
};

type StreamCallbacks = {
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

function sseEvent(type: string, value: unknown) {
  return encoder.encode(`event: ${type}\ndata: ${safeJson(value)}\n\n`);
}

function streamHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export function createChatCompletionStream(input: {
  request: ChatCompletionRequest;
  result: ProxyStreamResult;
  callbacks: StreamCallbacks;
}) {
  const id = createChatCompletionId();
  const created = Math.floor(Date.now() / 1000);
  const includeUsage = input.request.stream_options?.include_usage === true;
  const toolCalls = new Map<
    string,
    { index: number; name: string; arguments: string; started: boolean }
  >();
  let nextToolIndex = 0;

  const chunk = (
    delta: Record<string, unknown>,
    finishReason: string | null,
  ) => ({
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
      controller.enqueue(
        sseData(chunk({ role: "assistant", content: "" }, null)),
      );
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
              throw new OpenAIProxyError(
                part.reason || "The request was cancelled.",
                499,
                "invalid_request_error",
                "request_cancelled",
              );
            case "finish": {
              controller.enqueue(
                sseData(chunk({}, chatFinishReason(part.finishReason))),
              );
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

function initialResponse(input: {
  id: string;
  createdAt: number;
  request: ResponsesRequest;
  responseFormat: ProxyResponseFormat;
}) {
  const { id, createdAt, request, responseFormat } = input;
  return {
    id,
    object: "response",
    created_at: createdAt,
    status: "in_progress",
    background: false,
    error: null as { code: string | null; message: string } | null,
    incomplete_details: null as { reason: string } | null,
    instructions: request.instructions ?? null,
    max_output_tokens: request.max_output_tokens ?? null,
    max_tool_calls: null,
    model: request.model,
    output: [] as ResponsesOutputItem[],
    parallel_tool_calls: request.parallel_tool_calls ?? true,
    previous_response_id: null,
    prompt: null,
    reasoning: request.reasoning ?? null,
    safety_identifier: request.safety_identifier ?? null,
    service_tier: request.service_tier ?? "default",
    store: request.store ?? false,
    temperature: request.temperature ?? 1,
    text: responseTextConfig(responseFormat),
    tool_choice: request.tool_choice ?? "auto",
    tools: request.tools ?? [],
    top_logprobs: 0,
    top_p: request.top_p ?? 1,
    truncation: request.truncation ?? "disabled",
    usage: null as ReturnType<typeof responsesUsage> | null,
    user: null,
    metadata: request.metadata ?? {},
  };
}

export function createResponsesStream(input: {
  request: ResponsesRequest;
  responseFormat: ProxyResponseFormat;
  result: ProxyStreamResult;
  callbacks: StreamCallbacks;
}) {
  const id = createResponseId();
  const createdAt = Math.floor(Date.now() / 1000);
  const response = initialResponse({
    id,
    createdAt,
    request: input.request,
    responseFormat: input.responseFormat,
  });
  let sequenceNumber = 0;
  let nextOutputIndex = 0;
  let textState:
    | { itemId: string; outputIndex: number; text: string; done: boolean }
    | undefined;
  const functionStates = new Map<
    string,
    {
      itemId: string;
      outputIndex: number;
      name: string;
      arguments: string;
      done: boolean;
    }
  >();

  const emit = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    type: string,
    payload: Record<string, unknown>,
  ) => {
    controller.enqueue(
      sseEvent(type, { type, sequence_number: sequenceNumber++, ...payload }),
    );
  };

  const ensureTextStarted = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    if (textState) return textState;
    textState = {
      itemId: createMessageId(),
      outputIndex: nextOutputIndex++,
      text: "",
      done: false,
    };
    emit(controller, "response.output_item.added", {
      output_index: textState.outputIndex,
      item: {
        id: textState.itemId,
        type: "message",
        status: "in_progress",
        role: "assistant",
        content: [],
      },
    });
    emit(controller, "response.content_part.added", {
      item_id: textState.itemId,
      output_index: textState.outputIndex,
      content_index: 0,
      part: { type: "output_text", annotations: [], logprobs: [], text: "" },
    });
    return textState;
  };

  const finishText = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    if (!textState || textState.done) return;
    textState.done = true;
    const content = {
      type: "output_text" as const,
      annotations: [],
      logprobs: [],
      text: textState.text,
    };
    emit(controller, "response.output_text.done", {
      item_id: textState.itemId,
      output_index: textState.outputIndex,
      content_index: 0,
      text: textState.text,
      logprobs: [],
    });
    emit(controller, "response.content_part.done", {
      item_id: textState.itemId,
      output_index: textState.outputIndex,
      content_index: 0,
      part: content,
    });
    const item: ResponsesOutputItem = {
      id: textState.itemId,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [content],
    };
    response.output.push(item);
    emit(controller, "response.output_item.done", {
      output_index: textState.outputIndex,
      item,
    });
  };

  const finishFunction = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    callId: string,
    fallbackArguments?: string,
  ) => {
    const state = functionStates.get(callId);
    if (!state || state.done) return;
    if (!state.arguments && fallbackArguments)
      state.arguments = fallbackArguments;
    state.done = true;
    emit(controller, "response.function_call_arguments.done", {
      item_id: state.itemId,
      output_index: state.outputIndex,
      arguments: state.arguments,
    });
    const item: ResponsesOutputItem = {
      id: state.itemId,
      type: "function_call",
      status: "completed",
      arguments: state.arguments,
      call_id: callId,
      name: state.name,
    };
    response.output.push(item);
    emit(controller, "response.output_item.done", {
      output_index: state.outputIndex,
      item,
    });
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      emit(controller, "response.created", { response: { ...response } });
      emit(controller, "response.in_progress", { response: { ...response } });
      try {
        for await (const part of input.result.stream) {
          switch (part.type) {
            case "text-start":
              ensureTextStarted(controller);
              break;
            case "text-delta": {
              const state = ensureTextStarted(controller);
              state.text += part.text;
              emit(controller, "response.output_text.delta", {
                item_id: state.itemId,
                output_index: state.outputIndex,
                content_index: 0,
                delta: part.text,
                logprobs: [],
              });
              break;
            }
            case "text-end":
              finishText(controller);
              break;
            case "tool-input-start": {
              const state = {
                itemId: createFunctionItemId(),
                outputIndex: nextOutputIndex++,
                name: part.toolName,
                arguments: "",
                done: false,
              };
              functionStates.set(part.id, state);
              emit(controller, "response.output_item.added", {
                output_index: state.outputIndex,
                item: {
                  id: state.itemId,
                  type: "function_call",
                  status: "in_progress",
                  arguments: "",
                  call_id: part.id,
                  name: part.toolName,
                },
              });
              break;
            }
            case "tool-input-delta": {
              const state = functionStates.get(part.id);
              if (!state) break;
              state.arguments += part.delta;
              emit(controller, "response.function_call_arguments.delta", {
                item_id: state.itemId,
                output_index: state.outputIndex,
                delta: part.delta,
              });
              break;
            }
            case "tool-call": {
              const serialized = JSON.stringify(part.input ?? {});
              if (!functionStates.has(part.toolCallId)) {
                const state = {
                  itemId: createFunctionItemId(),
                  outputIndex: nextOutputIndex++,
                  name: part.toolName,
                  arguments: "",
                  done: false,
                };
                functionStates.set(part.toolCallId, state);
                emit(controller, "response.output_item.added", {
                  output_index: state.outputIndex,
                  item: {
                    id: state.itemId,
                    type: "function_call",
                    status: "in_progress",
                    arguments: "",
                    call_id: part.toolCallId,
                    name: part.toolName,
                  },
                });
                if (serialized) {
                  state.arguments = serialized;
                  emit(controller, "response.function_call_arguments.delta", {
                    item_id: state.itemId,
                    output_index: state.outputIndex,
                    delta: serialized,
                  });
                }
              }
              finishFunction(controller, part.toolCallId, serialized);
              break;
            }
            case "error":
              throw part.error;
            case "abort":
              throw new OpenAIProxyError(
                part.reason || "The request was cancelled.",
                499,
                "invalid_request_error",
                "request_cancelled",
              );
            case "finish": {
              finishText(controller);
              for (const callId of functionStates.keys()) {
                finishFunction(controller, callId);
              }
              const completion = responseCompletionState(part.finishReason);
              response.status = completion.status;
              response.incomplete_details = completion.incompleteDetails;
              response.usage = responsesUsage(part.totalUsage);
              const eventType =
                completion.status === "completed"
                  ? "response.completed"
                  : "response.incomplete";
              emit(controller, eventType, { response });
              await input.callbacks.onComplete(part.totalUsage);
              controller.close();
              return;
            }
          }
        }
        throw new Error("The upstream stream ended without a finish event.");
      } catch (error) {
        const normalized = providerError(error);
        await input.callbacks.onError(normalized);
        response.status = "failed";
        response.error = {
          code: normalized.code,
          message: normalized.message,
        };
        emit(controller, "response.failed", { response });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: streamHeaders() });
}
