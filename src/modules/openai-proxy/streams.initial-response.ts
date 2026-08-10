import type {
  ProxyResponseFormat,
  ResponsesRequest,
} from "@/modules/openai-proxy/contracts";
import {
  responsesUsage,
  responseTextConfig,
  type ResponsesOutputItem,
} from "@/modules/openai-proxy/response-builders";

export function initialResponse(input: {
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
