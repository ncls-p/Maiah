import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const organization = {
    id: "org-1",
    name: "Organization",
    logoUrl: null,
    theme: "ocean",
    themeConfigJson: null,
  };
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    set: vi.fn(),
    returning: vi.fn(),
  };
  for (const method of ["from", "innerJoin", "where", "set"] as const) {
    chain[method].mockReturnValue(chain);
  }
  return {
    organization,
    chain,
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    checkPermission: vi.fn(),
  };
});

vi.mock("@/server/infrastructure/db", () => ({
  db: { select: mocks.select, update: mocks.update },
}));
vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { checkPermission: mocks.checkPermission },
}));

import {
  getOrganizationBranding,
  updateOrganizationBranding,
} from "@/modules/organization/branding";

describe("organization branding authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chain.limit.mockResolvedValue([{ organization: mocks.organization }]);
    mocks.chain.returning.mockResolvedValue([mocks.organization]);
  });

  it("does not expose another organization without read access", async () => {
    mocks.checkPermission.mockResolvedValue({ granted: false });

    await expect(
      getOrganizationBranding({ workspaceId: "workspace-1", userId: "user-1" }),
    ).resolves.toBeNull();
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      expect.objectContaining({ principalId: "user-1" }),
      "organization.get",
      "organization",
      "org-1",
    );
  });

  it("returns read-only branding to a non-admin organization member", async () => {
    mocks.checkPermission
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce({ granted: false });

    await expect(
      getOrganizationBranding({ workspaceId: "workspace-1", userId: "user-1" }),
    ).resolves.toMatchObject({ organizationId: "org-1", canManage: false });
  });

  it("rejects updates without organization administration permission", async () => {
    mocks.checkPermission
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce({ granted: false });

    await expect(
      updateOrganizationBranding({
        workspaceId: "workspace-1",
        userId: "user-1",
        logoUrl: null,
        theme: "forest",
        themeConfig: null,
      }),
    ).resolves.toEqual({ status: "forbidden" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates the organization resolved from the selected workspace", async () => {
    mocks.checkPermission.mockResolvedValue({ granted: true });

    await expect(
      updateOrganizationBranding({
        workspaceId: "workspace-1",
        userId: "admin-1",
        logoUrl: null,
        theme: "violet",
        themeConfig: null,
      }),
    ).resolves.toMatchObject({ status: "updated" });
    expect(mocks.chain.where).toHaveBeenLastCalledWith(expect.anything());
    expect(mocks.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "violet", themeConfigJson: null }),
    );
  });
});
