import { beforeEach,describe,expect,it,vi } from "vitest";

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
  matchesPermission: (granted: string, required: string) => granted === required,
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

describe("route-handler – requireResourcePermissionAsync", async () => {
  const { requireResourcePermissionAsync } = await import("@/lib/route-handler");

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

    const result = await requireResourcePermissionAsync("user-1", "ws-1", "agents.get", "agent", "agent-1");

    expect(result).toBeNull();
    expect(authz.authorization.checkPermission).toHaveBeenCalledWith({ principalType: "user", principalId: "user-1" }, "agents.get", "agent", "agent-1");
  });

  it("returns 403 when the exact resource permission is denied", async () => {
    vi.mocked(authz.authorization.checkPermission).mockResolvedValue({
      granted: false,
      reason: "Missing permission: agents.get",
    });

    const result = await requireResourcePermissionAsync("user-1", "ws-1", "agents.get", "agent", "agent-1");

    expect(result!.status).toBe(403);
    expect(result!.body).toEqual({
      error: "Forbidden",
      reason: "Missing permission: agents.get",
    });
  });
});
