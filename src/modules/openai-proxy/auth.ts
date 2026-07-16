import { NextRequest, NextResponse } from "next/server";

import { logger, logHandledError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveAuthContext } from "@/modules/auth/resolve-auth";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import { checkWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import {
  OpenAIProxyError,
  openAIErrorBody,
  providerError,
} from "@/modules/openai-proxy/errors";

export type OpenAIProxyContext = {
  workspaceId: string;
  userId: string;
  apiKeyId: string;
  requestId: string;
};

function requestIdFrom(request: NextRequest) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

function responseHeaders(requestId: string) {
  return {
    "x-request-id": requestId,
    "openai-version": "2020-10-01",
  };
}

function requestsPerMinute() {
  const configured = Number.parseInt(process.env.OPENAI_PROXY_RPM ?? "120", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 120;
}

function errorResponse(error: OpenAIProxyError, requestId: string) {
  const headers = new Headers(responseHeaders(requestId));
  if (error.status === 401) headers.set("www-authenticate", "Bearer");
  return NextResponse.json(openAIErrorBody(error), {
    status: error.status,
    headers,
  });
}

export async function handleOpenAIProxyRoute(
  request: NextRequest,
  permission: "models.view" | "models.invoke",
  handler: (context: OpenAIProxyContext) => Promise<Response>,
) {
  const requestId = requestIdFrom(request);
  const startedAt = Date.now();

  try {
    const auth = await resolveAuthContext(request);
    if (!auth || auth.type !== "api_key") {
      return errorResponse(
        new OpenAIProxyError(
          "Incorrect API key provided. Create a scoped workspace API token in Maiah and send it as a Bearer token.",
          401,
          "authentication_error",
          "invalid_api_key",
        ),
        requestId,
      );
    }

    return await runWithRequestAuth(auth, async () => {
      const rateLimit = await checkRateLimit(request, {
        key: `openai-proxy:${auth.apiKeyId}`,
        limit: requestsPerMinute(),
        windowSeconds: 60,
      });
      if (!rateLimit.allowed) {
        const limited = errorResponse(
          new OpenAIProxyError(
            "Rate limit reached for this workspace API token.",
            429,
            "rate_limit_error",
            "rate_limit_exceeded",
          ),
          requestId,
        );
        limited.headers.set(
          "retry-after",
          String(Math.max(0, rateLimit.reset - Math.floor(Date.now() / 1000))),
        );
        return limited;
      }
      const access = await checkWorkspacePermissionForRequest(
        auth.userId,
        auth.workspaceId,
        permission,
      );
      if (!access.granted) {
        return errorResponse(
          new OpenAIProxyError(
            access.reason ?? `Missing permission: ${permission}`,
            403,
            "permission_error",
            "insufficient_permissions",
          ),
          requestId,
        );
      }

      const response = await handler({
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
        requestId,
      });
      response.headers.set("x-request-id", requestId);
      response.headers.set("openai-version", "2020-10-01");
      response.headers.set(
        "x-ratelimit-limit-requests",
        String(requestsPerMinute()),
      );
      response.headers.set(
        "x-ratelimit-remaining-requests",
        String(rateLimit.remaining),
      );
      response.headers.set(
        "x-ratelimit-reset-requests",
        `${Math.max(0, rateLimit.reset - Math.floor(Date.now() / 1000))}s`,
      );
      logger.info("OpenAI-compatible proxy request completed", {
        requestId,
        apiKeyId: auth.apiKeyId,
        workspaceId: auth.workspaceId,
        permission,
        method: request.method,
        path: request.nextUrl.pathname,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    });
  } catch (error) {
    const normalized = providerError(error);
    logHandledError(
      "OpenAI-compatible proxy request failed",
      {
        requestId,
        method: request.method,
        path: request.nextUrl.pathname,
        status: normalized.status,
        durationMs: Date.now() - startedAt,
      },
      error as Error,
    );
    return errorResponse(normalized, requestId);
  }
}
