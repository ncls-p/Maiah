import { NextRequest,NextResponse } from "next/server";

import { logger,logHandledError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { anthropicErrorBody } from "@/modules/anthropic-proxy/errors";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import { resolveAuthContext } from "@/modules/auth/resolve-auth";
import { checkWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import type { OpenAIProxyContext } from "@/modules/openai-proxy/auth";
import { OpenAIProxyError,providerError } from "@/modules/openai-proxy/errors";

function requestIdFrom(request: NextRequest) {
  return request.headers.get("request-id") ?? crypto.randomUUID();
}

function requestsPerMinute() {
  const configured = Number.parseInt(
    process.env.ANTHROPIC_PROXY_RPM ?? process.env.OPENAI_PROXY_RPM ?? "120",
    10,
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 120;
}

function errorResponse(error: OpenAIProxyError, requestId: string) {
  const response = NextResponse.json(anthropicErrorBody(error, requestId), {
    status: error.status,
  });
  response.headers.set("request-id", requestId);
  if (error.status === 401) response.headers.set("www-authenticate", "Bearer");
  return response;
}

export async function handleAnthropicProxyRoute(
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
          "Invalid API key. Create a scoped workspace API token and send it with x-api-key or Authorization: Bearer.",
          401,
          "authentication_error",
          "invalid_api_key",
        ),
        requestId,
      );
    }
    return await runWithRequestAuth(auth, async () => {
      const rateLimit = await checkRateLimit(request, {
        key: `anthropic-proxy:${auth.apiKeyId}`,
        limit: requestsPerMinute(),
        windowSeconds: 60,
      });
      if (!rateLimit.allowed) {
        const response = errorResponse(
          new OpenAIProxyError(
            "Rate limit reached for this workspace API token.",
            429,
            "rate_limit_error",
            "rate_limit_exceeded",
          ),
          requestId,
        );
        response.headers.set(
          "retry-after",
          String(Math.max(0, rateLimit.reset - Math.floor(Date.now() / 1000))),
        );
        return response;
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
      response.headers.set("request-id", requestId);
      response.headers.set("anthropic-version", "2023-06-01");
      logger.info("Anthropic-compatible proxy request completed", {
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
      "Anthropic-compatible proxy request failed",
      { requestId, path: request.nextUrl.pathname, status: normalized.status },
      error as Error,
    );
    return errorResponse(normalized, requestId);
  }
}
