import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  for (const method of ["from", "innerJoin", "leftJoin", "where"] as const) {
    chain[method].mockReturnValue(chain);
  }
  return {
    chain,
    select: vi.fn(() => chain),
  };
});

vi.mock("@/server/infrastructure/db", () => ({
  db: { select: mocks.select },
}));

import { getActiveOrganizationThemeForUser } from "@/modules/workspace/use-cases.active-organization-theme";

describe("getActiveOrganizationThemeForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue(mocks.chain);
    for (const method of ["from", "innerJoin", "leftJoin", "where"] as const) {
      mocks.chain[method].mockReturnValue(mocks.chain);
    }
  });

  it("uses the preferred workspace organization theme", async () => {
    mocks.chain.limit
      .mockResolvedValueOnce([{ activeWorkspaceId: "workspace-1" }])
      .mockResolvedValueOnce([
        { theme: "forest", themeConfigJson: { light: {}, dark: {} } },
      ]);

    await expect(getActiveOrganizationThemeForUser("user-1")).resolves.toEqual({
      theme: "forest",
      themeConfig: { light: {}, dark: {} },
    });
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("falls back to a membership workspace when no preference exists", async () => {
    mocks.chain.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ theme: "ember", themeConfigJson: null }]);

    await expect(getActiveOrganizationThemeForUser("user-1")).resolves.toEqual({
      theme: "ember",
      themeConfig: null,
    });
  });

  it("falls back when the preferred workspace is gone", async () => {
    mocks.chain.limit
      .mockResolvedValueOnce([{ activeWorkspaceId: "missing-workspace" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ theme: "violet", themeConfigJson: null }]);

    await expect(getActiveOrganizationThemeForUser("user-1")).resolves.toEqual({
      theme: "violet",
      themeConfig: null,
    });
  });

  it("returns null when the user has no visible organization", async () => {
    mocks.chain.limit.mockResolvedValue([]);

    await expect(
      getActiveOrganizationThemeForUser("user-1"),
    ).resolves.toBeNull();
  });
});
