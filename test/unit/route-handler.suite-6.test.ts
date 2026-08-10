import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("@/modules/auth/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/modules/api-keys/use-cases", () => ({
  verifyWorkspaceApiKey: vi.fn(),
}));

vi.mock("@/modules/admin/auth", () => ({
  isPlatformAdminSession: vi.fn(),
}));

vi.mock("@/server/domain/services/authorization", () => ({
  matchesPermission: (granted: string, required: string) =>
    granted === required,
  authorization: {
    checkPermission: vi.fn(),
    listPermissions: vi.fn(),
    requirePermission: vi.fn(),
    requireWorkspaceMember: vi.fn(),
  },
}));

const { findAccessResource } = vi.hoisted(() => ({
  findAccessResource: vi.fn(),
}));

vi.mock("@/server/infrastructure/db/access-resource-repository", () => ({
  findAccessResource,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logHandledError: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init: unknown) => ({
      body,
      init,
      status: (init as { status?: number })?.status ?? 200,
    })),
  },
}));

import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getSession } from "@/modules/auth/session";

import type { NextRequest } from "next/server";

describe("route-handler – handleAdminRoute", async () => {
  const { handleAdminRoute } = await import("@/lib/route-handler");
  const mockReq = {
    headers: new Headers({ "x-request-id": "admin-request-id" }),
    method: "GET",
    nextUrl: new URL("http://localhost"),
  } as unknown as NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const response = await handleAdminRoute(
      mockReq,
      async () => new Response("ok"),
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    vi.mocked(getSession).mockResolvedValue({
      session: { id: "s" },
      user: { id: "u" },
    } as never);
    vi.mocked(isPlatformAdminSession).mockResolvedValue(false);
    const response = await handleAdminRoute(
      mockReq,
      async () => new Response("ok"),
    );
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Forbidden" });
  });

  it("calls handler when admin", async () => {
    const session = { session: { id: "s" }, user: { id: "u" } };
    vi.mocked(getSession).mockResolvedValue(session as never);
    vi.mocked(isPlatformAdminSession).mockResolvedValue(true);
    const handler = vi.fn().mockResolvedValue(new Response("ok"));
    await handleAdminRoute(mockReq, handler);
    expect(handler).toHaveBeenCalledWith({
      session,
      request: expect.anything(),
      requestId: "admin-request-id",
    });
  });

  it("returns 500 on unhandled error", async () => {
    vi.mocked(getSession).mockRejectedValue(new Error("boom"));
    const response = await handleAdminRoute(
      mockReq,
      async () => new Response("ok"),
    );
    expect(response.status).toBe(500);
  });

  it("returns a custom response for an expected admin error", async () => {
    const session = { session: { id: "s" }, user: { id: "u" } };
    vi.mocked(getSession).mockResolvedValue(session as never);
    vi.mocked(isPlatformAdminSession).mockResolvedValue(true);
    const customResponse = { status: 409, body: { error: "Conflict" } };

    const response = await handleAdminRoute(
      mockReq,
      async () => {
        throw new Error("conflict");
      },
      {
        expectedError: (error) =>
          error instanceof Error && error.message === "conflict"
            ? (customResponse as never)
            : null,
      },
    );

    expect(response).toBe(customResponse);
  });
});
