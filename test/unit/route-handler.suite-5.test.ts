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

import * as authz from "@/server/domain/services/authorization";

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
