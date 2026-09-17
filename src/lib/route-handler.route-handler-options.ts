import { logger } from "@/lib/logger";
import { type AuthContext } from "@/modules/auth/resolve-auth";
import { getSession } from "@/modules/auth/session";
import { NextRequest, NextResponse } from "next/server";

/** Wrap an async handler with session authentication and consistent error handling. */
export type RouteHandlerOptions = {
  logLabel?: string;
  allowApiKey?: boolean;
  expectedError?: (error: unknown) => NextResponse | null;
};

export type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

type RouteLogScope = "workspace" | "admin";

export function requestIdFrom(req: NextRequest) {
  const supplied = req.headers?.get?.("x-request-id");
  return supplied && /^[a-zA-Z0-9_-]{1,100}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export function routePathFrom(req: NextRequest) {
  if (req.nextUrl?.pathname) return req.nextUrl.pathname;
  if (!req.url) return "unknown";
  try {
    return new URL(req.url).pathname;
  } catch {
    return "unknown";
  }
}

export function attachRequestId(response: Response, requestId: string) {
  try {
    response.headers.set("x-request-id", requestId);
  } catch {
    // Some tests and edge cases use lightweight Response-like objects.
  }
  return response;
}

export function routeLogData(
  req: NextRequest,
  requestId: string,
  startedAt: number,
  scope: RouteLogScope,
  status: number,
  session?: AuthSession,
  auth?: AuthContext,
) {
  return {
    requestId,
    method: req.method ?? "UNKNOWN",
    path: routePathFrom(req),
    status,
    durationMs: Date.now() - startedAt,
    scope,
    userId: session?.user?.id,
    authType: auth?.type,
    apiKeyId: auth?.type === "api_key" ? auth.apiKeyId : undefined,
  };
}

export function logRouteCompleted(
  req: NextRequest,
  requestId: string,
  startedAt: number,
  scope: RouteLogScope,
  response: Response,
  session?: AuthSession,
  auth?: AuthContext,
) {
  const path = routePathFrom(req);
  const routinePoll =
    req.method === "GET" &&
    response.status < 400 &&
    Date.now() - startedAt < 1000 &&
    (path === "/api/companion" ||
      path === "/api/workspace/tool-invocations" ||
      path === "/api/workspace/conversations" ||
      /^\/api\/workspace\/conversations\/[^/]+\/handoff$/.test(path));
  const log =
    response.status >= 500
      ? logger.error
      : response.status >= 400
        ? logger.warn
        : routinePoll
          ? logger.debug
          : logger.info;
  log(
    "API request completed",
    routeLogData(
      req,
      requestId,
      startedAt,
      scope,
      response.status,
      session,
      auth,
    ),
  );
  return attachRequestId(response, requestId);
}

export function logRouteRejected(
  req: NextRequest,
  requestId: string,
  startedAt: number,
  scope: RouteLogScope,
  status: number,
  reason: string,
  session?: AuthSession,
  auth?: AuthContext,
) {
  logger.warn("API request rejected", {
    ...routeLogData(req, requestId, startedAt, scope, status, session, auth),
    reason,
  });
}
