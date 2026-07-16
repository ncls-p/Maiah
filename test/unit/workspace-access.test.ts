import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkPermission, requireWorkspaceMember } = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  requireWorkspaceMember: vi.fn(),
}));

vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { checkPermission, requireWorkspaceMember },
  matchesPermission: (granted: string, required: string) =>
    granted === required ||
    granted === `${required.split(".")[0]}.manage` ||
    granted === `${required.split(".")[0]}.*`,
}));

import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import {
  checkWorkspacePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";

const apiKeyAuth = {
  type: "api_key" as const,
  apiKeyId: "key-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  scopes: ["agents.chat"],
};

describe("workspace API token access", () => {
  beforeEach(() => {
    checkPermission.mockReset();
    requireWorkspaceMember.mockReset();
  });

  it("grants only when token scope and current user permission both grant", async () => {
    checkPermission.mockResolvedValue({ granted: true });

    const result = await runWithRequestAuth(apiKeyAuth, () =>
      checkWorkspacePermissionForRequest(
        "user-1",
        "workspace-1",
        "agents.chat",
      ),
    );

    expect(result).toEqual({ granted: true });
    expect(checkPermission).toHaveBeenCalledOnce();
  });

  it("denies a permission outside the token scope before consulting RBAC", async () => {
    const result = await runWithRequestAuth(apiKeyAuth, () =>
      checkWorkspacePermissionForRequest(
        "user-1",
        "workspace-1",
        "agents.delete",
      ),
    );

    expect(result).toEqual({
      granted: false,
      reason: "API token scope missing: agents.delete",
    });
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it("denies cross-workspace use even when the scope matches", async () => {
    const result = await runWithRequestAuth(apiKeyAuth, () =>
      checkWorkspacePermissionForRequest(
        "user-1",
        "workspace-2",
        "agents.chat",
      ),
    );

    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/another workspace/i);
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it("denies when the owner no longer has the permission", async () => {
    checkPermission.mockResolvedValue({
      granted: false,
      reason: "Missing permission: agents.chat",
    });

    const result = await runWithRequestAuth(apiKeyAuth, () =>
      checkWorkspacePermissionForRequest(
        "user-1",
        "workspace-1",
        "agents.chat",
      ),
    );

    expect(result.granted).toBe(false);
    expect(result.reason).toBe("Missing permission: agents.chat");
  });

  it("denies membership checks outside the token workspace", async () => {
    requireWorkspaceMember.mockResolvedValue(true);

    const member = await runWithRequestAuth(apiKeyAuth, () =>
      isWorkspaceMemberForRequest("user-1", "workspace-2"),
    );

    expect(member).toBe(false);
    expect(requireWorkspaceMember).not.toHaveBeenCalled();
  });
});
