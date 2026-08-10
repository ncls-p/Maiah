import type { FinishReason, LanguageModelUsage } from "ai";

import type {
  ChatCompletionRequest,
  ProxyResponseFormat,
  ResponsesRequest,
} from "@/modules/openai-proxy/contracts";

export function createChatCompletionId() {
  return `chatcmpl-${crypto.randomUUID().replaceAll("-", "")}`;
}

export function createResponseId() {
  return `resp_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function createMessageId() {
  return `msg_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function createFunctionItemId() {
  return `fc_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function chatFinishReason(reason: FinishReason) {
  switch (reason) {
    case "length":
      return "length";
    case "content-filter":
      return "content_filter";
    case "tool-calls":
      return "tool_calls";
    case "stop":
      return "stop";
    default:
      return "stop";
  }
}

export function chatUsage(usage: LanguageModelUsage) {
  const promptTokens = usage.inputTokens ?? 0;
  const completionTokens = usage.outputTokens ?? 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: usage.totalTokens ?? promptTokens + completionTokens,
    prompt_tokens_details: {
      cached_tokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
    },
    completion_tokens_details: {
      reasoning_tokens: usage.outputTokenDetails.reasoningTokens ?? 0,
    },
  };
}

export function responsesUsage(usage: LanguageModelUsage) {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return {
    input_tokens: inputTokens,
    input_tokens_details: {
      cached_tokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
    },
    output_tokens: outputTokens,
    output_tokens_details: {
      reasoning_tokens: usage.outputTokenDetails.reasoningTokens ?? 0,
    },
    total_tokens: usage.totalTokens ?? inputTokens + outputTokens,
  };
}

export type ProxyGenerationResult = {
  text: string;
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }>;
  finishReason: FinishReason;
  usage: LanguageModelUsage;
};

function serializedToolCalls(result: ProxyGenerationResult) {
  return result.toolCalls.map((call) => ({
    id: call.toolCallId,
    type: "function" as const,
    function: {
      name: call.toolName,
      arguments: JSON.stringify(call.input ?? {}),
    },
  }));
}

export function buildChatCompletionResponse(input: {
  request: ChatCompletionRequest;
  result: ProxyGenerationResult;
  id?: string;
  created?: number;
}) {
  const { request, result } = input;
  const toolCalls = serializedToolCalls(result);
  return {
    id: input.id ?? createChatCompletionId(),
    object: "chat.completion",
    created: input.created ?? Math.floor(Date.now() / 1000),
    model: request.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: result.text || null,
          refusal: null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        logprobs: null,
        finish_reason: chatFinishReason(result.finishReason),
      },
    ],
    usage: chatUsage(result.usage),
    service_tier: request.service_tier ?? "default",
    system_fingerprint: null,
  };
}

export type ResponsesOutputItem =
  | {
      id: string;
      type: "message";
      status: "completed";
      role: "assistant";
      content: Array<{
        type: "output_text";
        annotations: unknown[];
        logprobs: unknown[];
        text: string;
      }>;
    }
  | {
      id: string;
      type: "function_call";
      status: "completed";
      arguments: string;
      call_id: string;
      name: string;
    };

function resultOutputItems(
  result: ProxyGenerationResult,
): ResponsesOutputItem[] {
  const output: ResponsesOutputItem[] = [];
  if (result.text) {
    output.push({
      id: createMessageId(),
      type: "message",
      status: "completed",
      role: "assistant",
      content: [
        {
          type: "output_text",
          annotations: [],
          logprobs: [],
          text: result.text,
        },
      ],
    });
  }
  for (const call of result.toolCalls) {
    output.push({
      id: createFunctionItemId(),
      type: "function_call",
      status: "completed",
      arguments: JSON.stringify(call.input ?? {}),
      call_id: call.toolCallId,
      name: call.toolName,
    });
  }
  return output;
}

function responseStatus(reason: FinishReason) {
  return reason === "length" || reason === "content-filter"
    ? "incomplete"
    : "completed";
}

function incompleteDetails(reason: FinishReason) {
  if (reason === "length") return { reason: "max_output_tokens" };
  if (reason === "content-filter") return { reason: "content_filter" };
  return null;
}

export function responseTextConfig(format: ProxyResponseFormat) {
  if (format.type === "json_schema") {
    return {
      format: {
        type: "json_schema",
        name: format.name,
        description: format.description,
        schema: format.schema,
        strict: format.strict ?? false,
      },
    };
  }
  return { format: { type: format.type } };
}

export function buildResponsesResponse(input: {
  request: ResponsesRequest;
  responseFormat: ProxyResponseFormat;
  result: ProxyGenerationResult;
  id?: string;
  createdAt?: number;
}) {
  const { request, responseFormat, result } = input;
  return {
    id: input.id ?? createResponseId(),
    object: "response",
    created_at: input.createdAt ?? Math.floor(Date.now() / 1000),
    status: responseStatus(result.finishReason),
    background: false,
    error: null,
    incomplete_details: incompleteDetails(result.finishReason),
    instructions: request.instructions ?? null,
    max_output_tokens: request.max_output_tokens ?? null,
    max_tool_calls: null,
    model: request.model,
    output: resultOutputItems(result),
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
    usage: responsesUsage(result.usage),
    user: null,
    metadata: request.metadata ?? {},
  };
}

export function responseCompletionState(reason: FinishReason) {
  return {
    status: responseStatus(reason),
    incompleteDetails: incompleteDetails(reason),
  };
}
