import { logger, logHandledError } from "@/lib/logger";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getSession } from "@/modules/auth/session";
import { NextRequest, NextResponse } from "next/server";
import {
  attachRequestId,
  AuthSession,
  logRouteCompleted,
  logRouteRejected,
  requestIdFrom,
  RouteHandlerOptions,
  routeLogData,
} from "./route-handler.route-handler-options";

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
