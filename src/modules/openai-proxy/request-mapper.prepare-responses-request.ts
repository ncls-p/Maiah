import type { ProxyResponseFormat,ResponsesRequest } from "@/modules/openai-proxy/contracts";
import { invalidRequest } from "@/modules/openai-proxy/errors";
import { commonPreparation } from "./request-mapper.common-preparation";
import { PreparedProxyGeneration } from "./request-mapper.prepared-proxy-generation";
import { responsesMessages } from "./request-mapper.responses-messages";

export function prepareResponsesRequest(request: ResponsesRequest): PreparedProxyGeneration {
  if (request.previous_response_id) {
    throw invalidRequest("previous_response_id is not available because this proxy is stateless.", "previous_response_id", "unsupported_parameter");
  }
  if (request.store) {
    throw invalidRequest("Stored responses are not supported because this proxy is stateless.", "store", "unsupported_parameter");
  }
  if (request.background) {
    throw invalidRequest("Background responses are not supported by this proxy.", "background", "unsupported_parameter");
  }
  if (request.include?.length) {
    throw invalidRequest("The requested include expansions are not supported by this proxy.", "include", "unsupported_parameter");
  }
  if (request.reasoning?.summary) {
    throw invalidRequest("Reasoning summaries are not exposed by this proxy.", "reasoning.summary", "unsupported_parameter");
  }
  if (request.prompt != null || request.conversation != null || request.context_management != null || request.max_tool_calls != null || request.top_logprobs != null) {
    const param = request.prompt != null ? "prompt" : request.conversation != null ? "conversation" : request.context_management != null ? "context_management" : request.max_tool_calls != null ? "max_tool_calls" : "top_logprobs";
    throw invalidRequest(`The '${param}' parameter is not supported by this proxy.`, param, "unsupported_parameter");
  }

  const textFormat = request.text?.format;
  const responseFormat: ProxyResponseFormat | undefined = textFormat ? (textFormat.type === "json_schema" ? textFormat : { type: textFormat.type }) : undefined;

  const messages = responsesMessages(request);
  if (request.instructions) {
    messages.unshift({ role: "system", content: request.instructions });
  }

  return commonPreparation({
    messages,
    definitions: request.tools,
    toolChoice: request.tool_choice,
    responseFormat,
    maxOutputTokens: request.max_output_tokens,
    temperature: request.temperature,
    topP: request.top_p,
    providerOptions: {
      parallelToolCalls: request.parallel_tool_calls,
      reasoningEffort: request.reasoning?.effort,
      serviceTier: request.service_tier,
      store: request.store,
      safetyIdentifier: request.safety_identifier,
      promptCacheKey: request.prompt_cache_key,
      truncation: request.truncation,
      user: request.user,
    },
  });
}
