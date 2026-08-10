import { describe, expect, it, vi } from "vitest";

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

import { runWithRequestAuth } from "@/modules/auth/request-auth-context";

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
