import { logger, logHandledError } from "@/lib/logger";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import {
  resolveAuthContext,
  type AuthContext,
} from "@/modules/auth/resolve-auth";
import {
  checkRequestPermissionScope,
  checkResourcePermissionForRequest,
  checkWorkspacePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { NextRequest, NextResponse } from "next/server";
import {
  attachRequestId,
  AuthSession,
  logRouteCompleted,
  logRouteRejected,
  requestIdFrom,
  RouteHandlerOptions,
  routeLogData,
  routePathFrom,
} from "./route-handler.route-handler-options";

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

export async function requireRequestPermissionScopeAsync(
  sessionId: string,
  workspaceId: string,
  permission: string,
): Promise<NextResponse | null> {
  const result = checkRequestPermissionScope(
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

export async function requireResourcePermissionAsync(
  sessionId: string,
  workspaceId: string,
  permission: string,
  resourceType: AccessResourceType,
  resourceId: string,
): Promise<NextResponse | null> {
  const result = await checkResourcePermissionForRequest(
    sessionId,
    workspaceId,
    permission,
    resourceType,
    resourceId,
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
