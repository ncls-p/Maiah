import { beforeEach, describe, expect, it, vi } from "vitest";

const checkPermission = vi.fn();
const listPermissions = vi.fn();

vi.mock("@/server/domain/services/authorization", () => ({
  authorization: {
    checkPermission,
    listPermissions,
  },
  matchesPermission: (granted: string, required: string) =>
    granted === required,
}));

describe("api key permissions", () => {
  beforeEach(() => {
    checkPermission.mockReset();
    listPermissions.mockReset();
  });

  it("returns all when the user can manage all API keys", async () => {
    checkPermission
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce({ granted: true });

    const { getApiKeyAccessScope } =
      await import("../../src/modules/api-keys/permissions");

    await expect(getApiKeyAccessScope("user-1", "workspace-1")).resolves.toBe(
      "all",
    );
    expect(checkPermission).toHaveBeenCalledWith(
      { principalType: "user", principalId: "user-1" },
      "apiKeys.manage",
      "workspace",
      "workspace-1",
    );
  });

  it("returns own when only manage-own permission is granted", async () => {
    checkPermission
      .mockResolvedValueOnce({ granted: false })
      .mockResolvedValueOnce({ granted: true });

    const { getApiKeyAccessScope } =
      await import("../../src/modules/api-keys/permissions");

    await expect(getApiKeyAccessScope("user-1", "workspace-1")).resolves.toBe(
      "own",
    );
  });

  it("returns null when no API key permission is granted", async () => {
    checkPermission.mockResolvedValue({ granted: false });

    const { getApiKeyAccessScope } =
      await import("../../src/modules/api-keys/permissions");

    await expect(getApiKeyAccessScope("user-1", "workspace-1")).resolves.toBe(
      null,
    );
  });

  it("lists only permissions currently granted to the user", async () => {
    listPermissions.mockResolvedValue(["agents.chat", "usage.view"]);
    const { getAvailableApiKeyScopes } =
      await import("../../src/modules/api-keys/permissions");

    const scopes = await getAvailableApiKeyScopes("user-1", "workspace-1");

    expect(scopes.map(({ permission }) => permission)).toEqual([
      "agents.chat",
      "usage.view",
    ]);
    expect(listPermissions).toHaveBeenCalledWith(
      { principalType: "user", principalId: "user-1" },
      "workspace",
      "workspace-1",
    );
  });

  it("intersects grantable permissions with the calling token scopes", async () => {
    listPermissions.mockResolvedValue(["agents.chat", "usage.view"]);
    const [{ getAvailableApiKeyScopes }, { runWithRequestAuth }] =
      await Promise.all([
        import("../../src/modules/api-keys/permissions"),
        import("../../src/modules/auth/request-auth-context"),
      ]);

    const scopes = await runWithRequestAuth(
      {
        type: "api_key",
        apiKeyId: "key-1",
        workspaceId: "workspace-1",
        userId: "user-1",
        scopes: ["agents.chat"],
      },
      () => getAvailableApiKeyScopes("user-1", "workspace-1"),
    );

    expect(scopes.map(({ permission }) => permission)).toEqual(["agents.chat"]);
  });
});
