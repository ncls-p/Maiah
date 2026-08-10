import type { JSONValue } from "@ai-sdk/provider";
import { type ModelMessage } from "ai";

import type {
  ChatCompletionRequest,
  FunctionDefinition,
  ProxyResponseFormat,
  ProxyToolChoice,
} from "@/modules/openai-proxy/contracts";
import { invalidRequest } from "@/modules/openai-proxy/errors";
import { chatMessages } from "./request-mapper.chat-messages";
import { PreparedProxyGeneration } from "./request-mapper.prepared-proxy-generation";
import {
  buildTools,
  normalizeToolChoice,
  prepareOutput,
} from "./request-mapper.responses-messages";

export function commonPreparation(input: {
  messages: ModelMessage[];
  definitions?: FunctionDefinition[];
  toolChoice?: ProxyToolChoice;
  responseFormat?: ProxyResponseFormat;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  stop?: string | string[];
  providerOptions?: Record<string, JSONValue | undefined>;
}): PreparedProxyGeneration {
  const tools = buildTools(input.definitions);
  const toolChoice = normalizeToolChoice(input.toolChoice);
  if (
    toolChoice &&
    typeof toolChoice !== "string" &&
    !tools?.[toolChoice.toolName]
  ) {
    throw invalidRequest(
      `Tool choice '${toolChoice.toolName}' was not found in tools.`,
      "tool_choice",
      "unknown_tool",
    );
  }
  const output = prepareOutput(input.responseFormat);
  return {
    messages: input.messages,
    tools,
    toolChoice,
    ...output,
    maxOutputTokens: input.maxOutputTokens,
    temperature: input.temperature,
    topP: input.topP,
    topK: input.topK,
    presencePenalty: input.presencePenalty,
    frequencyPenalty: input.frequencyPenalty,
    seed: input.seed,
    stopSequences: typeof input.stop === "string" ? [input.stop] : input.stop,
    providerOptions: input.providerOptions ?? {},
  };
}

export function prepareChatCompletion(
  request: ChatCompletionRequest,
): PreparedProxyGeneration {
  if ((request.n ?? 1) !== 1) {
    throw invalidRequest(
      "This proxy currently supports exactly one completion per request.",
      "n",
      "unsupported_value",
    );
  }
  if (request.logprobs || request.top_logprobs != null) {
    throw invalidRequest(
      "Log probabilities are not supported by this proxy.",
      "logprobs",
      "unsupported_parameter",
    );
  }
  if (
    request.audio != null ||
    request.modalities?.some((value) => value !== "text")
  ) {
    throw invalidRequest(
      "Audio output is not supported by this proxy.",
      "modalities",
      "unsupported_parameter",
    );
  }
  if (request.store) {
    throw invalidRequest(
      "Stored completions are not supported because this proxy is stateless.",
      "store",
      "unsupported_parameter",
    );
  }
  if (
    request.web_search_options != null ||
    request.prediction != null ||
    request.verbosity != null
  ) {
    throw invalidRequest(
      "Web search options, predicted output and verbosity are not supported by this proxy.",
      request.web_search_options != null
        ? "web_search_options"
        : request.prediction != null
          ? "prediction"
          : "verbosity",
      "unsupported_parameter",
    );
  }
  if (request.tools?.length && request.functions?.length) {
    throw invalidRequest(
      "Use either tools or deprecated functions, not both.",
      "functions",
      "invalid_request",
    );
  }
  const responseFormat = request.response_format
    ? request.response_format.type === "json_schema"
      ? {
          type: "json_schema" as const,
          ...request.response_format.json_schema,
        }
      : request.response_format
    : undefined;

  const legacyToolChoice = request.function_call
    ? typeof request.function_call === "string"
      ? request.function_call
      : ({ type: "function", name: request.function_call.name } as const)
    : undefined;

  return commonPreparation({
    messages: chatMessages(request),
    definitions:
      request.tools?.map((tool) => tool.function) ?? request.functions,
    toolChoice: request.tool_choice ?? legacyToolChoice,
    responseFormat,
    maxOutputTokens:
      request.max_completion_tokens ?? request.max_tokens ?? undefined,
    temperature: request.temperature,
    topP: request.top_p,
    presencePenalty: request.presence_penalty,
    frequencyPenalty: request.frequency_penalty,
    seed: request.seed,
    stop: request.stop,
    providerOptions: {
      parallelToolCalls: request.parallel_tool_calls,
      reasoningEffort: request.reasoning_effort,
      serviceTier: request.service_tier,
      store: request.store,
      user: request.user,
    },
  });
}
