import { describe, expect, it, vi, beforeEach } from "vitest";

import { getSession } from "@/modules/auth/session";
import { verifyWorkspaceApiKey } from "@/modules/api-keys/use-cases";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import * as authz from "@/server/domain/services/authorization";

import type { NextRequest } from "next/server";
import { findAccessResource } from "./route-handler.test.module-1";


describe("route-handler – requireResourcePermissionAsync", async () => {
  const { requireResourcePermissionAsync } =
    await import("@/lib/route-handler");

  beforeEach(() => {
    vi.clearAllMocks();
    findAccessResource.mockResolvedValue({
      id: "agent-1",
      type: "agent",
      name: "Support",
      workspaceId: "ws-1",
      organizationId: "org-1",
    });
  });

  it("returns null when the exact resource permission is granted", async () => {
    vi.mocked(authz.authorization.checkPermission).mockResolvedValue({
      granted: true,
    });

    const result = await requireResourcePermissionAsync(
      "user-1",
      "ws-1",
      "agents.get",
      "agent",
      "agent-1",
    );

    expect(result).toBeNull();
    expect(authz.authorization.checkPermission).toHaveBeenCalledWith(
      { principalType: "user", principalId: "user-1" },
      "agents.get",
      "agent",
      "agent-1",
    );
  });

  it("returns 403 when the exact resource permission is denied", async () => {
    vi.mocked(authz.authorization.checkPermission).mockResolvedValue({
      granted: false,
      reason: "Missing permission: agents.get",
    });

    const result = await requireResourcePermissionAsync(
      "user-1",
      "ws-1",
      "agents.get",
      "agent",
      "agent-1",
    );

    expect(result!.status).toBe(403);
    expect(result!.body).toEqual({
      error: "Forbidden",
      reason: "Missing permission: agents.get",
    });
  });
});

describe("route-handler – requireRequestPermissionScopeAsync", async () => {
  const { requireRequestPermissionScopeAsync } =
    await import("@/lib/route-handler");

  it("allows user sessions because their permissions are checked separately", async () => {
    await expect(
      requireRequestPermissionScopeAsync(
        "user-1",
        "workspace-1",
        "agents.list",
      ),
    ).resolves.toBeNull();
  });

  it("returns the precise missing-scope reason for API tokens", async () => {
    const result = await runWithRequestAuth(
      {
        type: "api_key",
        apiKeyId: "key-1",
        workspaceId: "workspace-1",
        userId: "user-1",
        scopes: ["agents.list"],
      },
      () =>
        requireRequestPermissionScopeAsync(
          "user-1",
          "workspace-1",
          "providers.viewMetadata",
        ),
    );

    expect(result!.status).toBe(403);
    expect(result!.body).toEqual({
      error: "Forbidden",
      reason: "API token scope missing: providers.viewMetadata",
    });
  });
});

describe("route-handler – requireWorkspaceMemberAsync", async () => {
  const { requireWorkspaceMemberAsync } = await import("@/lib/route-handler");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when member", async () => {
    vi.mocked(authz.authorization.requireWorkspaceMember).mockResolvedValue(
      true,
    );
    const result = await requireWorkspaceMemberAsync("user-1", "ws-1");
    expect(result).toBeNull();
    expect(authz.authorization.requireWorkspaceMember).toHaveBeenCalledWith(
      "user-1",
      "ws-1",
    );
  });

  it("returns 403 when not a member", async () => {
    vi.mocked(authz.authorization.requireWorkspaceMember).mockResolvedValue(
      false,
    );
    const result = await requireWorkspaceMemberAsync("user-1", "ws-1");
    expect(result!.status).toBe(403);
    expect(result!.body).toEqual({ error: "Forbidden" });
  });
});

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
