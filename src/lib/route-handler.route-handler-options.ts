import { logger } from "@/lib/logger";
import {
type AuthContext
} from "@/modules/auth/resolve-auth";
import { getSession } from "@/modules/auth/session";
import { NextRequest,NextResponse } from "next/server";

/** Wrap an async handler with session authentication and consistent error handling. */
export type RouteHandlerOptions = {
  logLabel?: string;
  allowApiKey?: boolean;
  expectedError?: (error: unknown) => NextResponse | null;
};

export type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

type RouteLogScope = "workspace" | "admin";

export function requestIdFrom(req: NextRequest) {
  return req.headers?.get?.("x-request-id") ?? crypto.randomUUID();
}

export function routePathFrom(req: NextRequest) {
  if (req.nextUrl?.pathname) return req.nextUrl.pathname;
  if (req.url) return new URL(req.url).pathname;
  return "unknown";
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
  logger.info(
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
