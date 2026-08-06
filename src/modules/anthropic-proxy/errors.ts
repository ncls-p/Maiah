import type { OpenAIProxyError } from "@/modules/openai-proxy/errors";

function anthropicErrorType(error: OpenAIProxyError) {
  if (error.status === 401) return "authentication_error";
  if (error.status === 403) return "permission_error";
  if (error.status === 404) return "not_found_error";
  if (error.status === 413) return "request_too_large";
  if (error.status === 429) return "rate_limit_error";
  if (error.status >= 500) return "api_error";
  return "invalid_request_error";
}

export function anthropicErrorBody(error: OpenAIProxyError, requestId: string) {
  return {
    type: "error",
    error: {
      type: anthropicErrorType(error),
      message: error.message,
    },
    request_id: requestId,
  };
}
