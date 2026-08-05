import type {
ProxyResponseFormat,
ResponsesRequest
} from "@/modules/openai-proxy/contracts";
import {
OpenAIProxyError,
providerError
} from "@/modules/openai-proxy/errors";
import {
createFunctionItemId,
createMessageId,
createResponseId,
responseCompletionState,
responsesUsage,
type ResponsesOutputItem
} from "@/modules/openai-proxy/response-builders";
import { initialResponse } from "./streams.initial-response";
import { ProxyStreamResult,StreamCallbacks,sseEvent,streamHeaders } from "./streams.proxy-stream-result";
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
