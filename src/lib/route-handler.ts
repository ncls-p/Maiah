import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import {
  resolveAuthContext,
  type AuthContext,
} from "@/modules/auth/resolve-auth";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import { getSession } from "@/modules/auth/session";
import {
  checkWorkspacePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";
import { logger, logHandledError } from "@/lib/logger";

/** Wrap an async handler with session authentication and consistent error handling. */
export type RouteHandlerOptions = {
  logLabel?: string;
  allowApiKey?: boolean;
  expectedError?: (error: unknown) => NextResponse | null;
};

type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

type RouteLogScope = "workspace" | "admin";

function requestIdFrom(req: NextRequest) {
  return req.headers?.get?.("x-request-id") ?? crypto.randomUUID();
}

function routePathFrom(req: NextRequest) {
  if (req.nextUrl?.pathname) return req.nextUrl.pathname;
  if (req.url) return new URL(req.url).pathname;
  return "unknown";
}

function attachRequestId(response: Response, requestId: string) {
  try {
    response.headers.set("x-request-id", requestId);
  } catch {
    // Some tests and edge cases use lightweight Response-like objects.
  }
  return response;
}

function routeLogData(
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

function logRouteCompleted(
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

function logRouteRejected(
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

/** Wrap an async handler with session authentication and consistent error handling. */
export async function handleRoute(
  req: NextRequest,
  handler: (ctx: {
    session: AuthSession;
    auth: AuthContext;
    request: NextRequest;
    requestId: string;
  }) => Promise<Response>,
  opts?: RouteHandlerOptions,
): Promise<Response> {
  const requestId = requestIdFrom(req);
  const startedAt = Date.now();

  try {
    const auth = await resolveAuthContext(req);
    if (!auth) {
      logRouteRejected(
        req,
        requestId,
        startedAt,
        "workspace",
        401,
        "no_authentication",
      );
      return attachRequestId(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        requestId,
      );
    }
    if (
      auth.type === "api_key" &&
      (opts?.allowApiKey === false ||
        routePathFrom(req).startsWith("/api/admin/"))
    ) {
      logRouteRejected(
        req,
        requestId,
        startedAt,
        "workspace",
        403,
        "api_key_not_supported",
        undefined,
        auth,
      );
      return attachRequestId(
        NextResponse.json(
          { error: "Forbidden", reason: "API token not supported" },
          { status: 403 },
        ),
        requestId,
      );
    }
    const session = {
      user: {
        id: auth.userId,
        email: auth.type === "user" ? auth.email : "",
        name: auth.type === "user" ? auth.name : "API token",
        role: auth.type === "user" ? auth.role : null,
      },
    } as AuthSession;
    const response = await runWithRequestAuth(auth, () =>
      handler({ session, auth, request: req, requestId }),
    );
    return logRouteCompleted(
      req,
      requestId,
      startedAt,
      "workspace",
      response,
      session,
      auth,
    );
  } catch (error) {
    const expected = opts?.expectedError?.(error);
    if (expected) {
      logger.info("API request handled expected error", {
        ...routeLogData(
          req,
          requestId,
          startedAt,
          "workspace",
          expected.status,
        ),
        error: error instanceof Error ? error.message : String(error),
      });
      return attachRequestId(expected, requestId);
    }
    logHandledError(
      opts?.logLabel ?? "Route handler error",
      routeLogData(req, requestId, startedAt, "workspace", 500),
      error as Error,
    );
    return attachRequestId(
      NextResponse.json({ error: "Internal server error" }, { status: 500 }),
      requestId,
    );
  }
}

/**
 * Async version – check workspace permission and return early on failure.
 */
export async function requireWorkspacePermissionAsync(
  sessionId: string,
  workspaceId: string,
  permission: string,
): Promise<NextResponse | null> {
  const result = await checkWorkspacePermissionForRequest(
    sessionId,
    workspaceId,
    permission,
  );
  if (!result.granted) {
    return NextResponse.json(
      { error: "Forbidden", reason: result.reason },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Check that the user is a workspace member.
 */
export async function requireWorkspaceMemberAsync(
  userId: string,
  workspaceId: string,
): Promise<NextResponse | null> {
  const isMember = await isWorkspaceMemberForRequest(userId, workspaceId);
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Wrap an async handler with admin session auth + error handling.
 * Requires the user to have the admin role.
 */
export async function handleAdminRoute(
  req: NextRequest,
  handler: (ctx: {
    session: AuthSession;
    request: NextRequest;
    requestId: string;
  }) => Promise<Response>,
  opts?: RouteHandlerOptions,
): Promise<Response> {
  const requestId = requestIdFrom(req);
  const startedAt = Date.now();

  try {
    const session = await getSession();
    if (!session) {
      logRouteRejected(req, requestId, startedAt, "admin", 401, "no_session");
      return attachRequestId(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        requestId,
      );
    }
    if (!(await isPlatformAdminSession(session))) {
      logRouteRejected(
        req,
        requestId,
        startedAt,
        "admin",
        403,
        "not_platform_admin",
        session,
      );
      return attachRequestId(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        requestId,
      );
    }
    const response = await handler({ session, request: req, requestId });
    return logRouteCompleted(
      req,
      requestId,
      startedAt,
      "admin",
      response,
      session,
    );
  } catch (error) {
    const expected = opts?.expectedError?.(error);
    if (expected) {
      logger.info("API admin request handled expected error", {
        ...routeLogData(req, requestId, startedAt, "admin", expected.status),
        error: error instanceof Error ? error.message : String(error),
      });
      return attachRequestId(expected, requestId);
    }
    logHandledError(
      opts?.logLabel ?? "Admin route handler error",
      routeLogData(req, requestId, startedAt, "admin", 500),
      error as Error,
    );
    return attachRequestId(
      NextResponse.json({ error: "Internal server error" }, { status: 500 }),
      requestId,
    );
  }
}
