import type { FinishReason,LanguageModelUsage } from "ai";

import type { AnthropicMessagesRequest } from "@/modules/anthropic-proxy/contracts";
import type { ProxyGenerationResult } from "@/modules/openai-proxy/response-builders";

export function createAnthropicMessageId() {
  return `msg_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function anthropicStopReason(reason: FinishReason) {
  if (reason === "length") return "max_tokens";
  if (reason === "tool-calls") return "tool_use";
  if (reason === "content-filter") return "refusal";
  return "end_turn";
}

export function anthropicUsage(usage: LanguageModelUsage) {
  return {
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0,
    cache_creation_input_tokens: usage.inputTokenDetails.cacheWriteTokens ?? 0,
    cache_read_input_tokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
  };
}

export function buildAnthropicMessageResponse(input: {
  request: AnthropicMessagesRequest;
  result: ProxyGenerationResult;
  id?: string;
}) {
  const content: Array<Record<string, unknown>> = [];
  if (input.result.text) {
    content.push({ type: "text", text: input.result.text });
  }
  for (const call of input.result.toolCalls) {
    content.push({
      type: "tool_use",
      id: call.toolCallId,
      name: call.toolName,
      input: call.input ?? {},
    });
  }
  return {
    id: input.id ?? createAnthropicMessageId(),
    type: "message",
    role: "assistant",
    model: input.request.model,
    content,
    stop_reason: anthropicStopReason(input.result.finishReason),
    stop_sequence: null,
    usage: anthropicUsage(input.result.usage),
  };
}
