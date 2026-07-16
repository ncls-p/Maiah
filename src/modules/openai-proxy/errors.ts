import { z } from "zod";

export type OpenAIErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "rate_limit_error"
  | "server_error";

export class OpenAIProxyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type: OpenAIErrorType,
    readonly code: string | null = null,
    readonly param: string | null = null,
  ) {
    super(message);
    this.name = "OpenAIProxyError";
  }
}

export function invalidRequest(
  message: string,
  param: string | null = null,
  code = "invalid_request",
) {
  return new OpenAIProxyError(
    message,
    400,
    "invalid_request_error",
    code,
    param,
  );
}

export function openAIErrorBody(error: OpenAIProxyError) {
  return {
    error: {
      message: error.message,
      type: error.type,
      param: error.param,
      code: error.code,
    },
  };
}

export function validationError(error: z.ZodError) {
  const issue = error.issues[0];
  const param = issue?.path.join(".") || null;
  return invalidRequest(
    issue ? `${param ? `${param}: ` : ""}${issue.message}` : "Invalid request",
    param,
  );
}

export function providerError(error: unknown) {
  if (error instanceof OpenAIProxyError) return error;
  const candidate = error as {
    message?: unknown;
    statusCode?: unknown;
    status?: unknown;
    responseBody?: unknown;
  };
  const statusValue = candidate?.statusCode ?? candidate?.status;
  const status = typeof statusValue === "number" ? statusValue : 502;
  const message =
    typeof candidate?.message === "string" && candidate.message.trim()
      ? candidate.message
      : "The upstream model provider returned an error.";

  if (status === 429) {
    return new OpenAIProxyError(
      message,
      429,
      "rate_limit_error",
      "upstream_rate_limit",
    );
  }
  if (status >= 400 && status < 500) {
    return new OpenAIProxyError(
      message,
      status,
      "invalid_request_error",
      "upstream_request_error",
    );
  }
  return new OpenAIProxyError(
    "The upstream model provider could not complete the request.",
    502,
    "server_error",
    "upstream_error",
  );
}
