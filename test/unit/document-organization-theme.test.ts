import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getActiveOrganizationThemeForUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/modules/workspace/use-cases", () => ({
  getActiveOrganizationThemeForUser: getActiveOrganizationThemeForUserMock,
}));

import { ORGANIZATION_THEME_PRESETS } from "@/modules/organization/themes";
import { resolveDocumentOrganizationTheme } from "@/lib/document-organization-theme";

describe("resolveDocumentOrganizationTheme", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getActiveOrganizationThemeForUserMock.mockReset();
  });

  it("returns null when the visitor is anonymous", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(resolveDocumentOrganizationTheme()).resolves.toBeNull();
    expect(getActiveOrganizationThemeForUserMock).not.toHaveBeenCalled();
  });

  it("returns the active organization palette for first paint", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getActiveOrganizationThemeForUserMock.mockResolvedValue({
      theme: "violet",
      themeConfig: null,
    });

    await expect(resolveDocumentOrganizationTheme()).resolves.toEqual({
      themeName: "violet",
      css: expect.stringContaining(
        `--primary:${ORGANIZATION_THEME_PRESETS.violet.light.primary}`,
      ),
    });
    expect(getActiveOrganizationThemeForUserMock).toHaveBeenCalledWith(
      "user-1",
    );
  });

  it("returns null when the user has no workspace yet", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getActiveOrganizationThemeForUserMock.mockResolvedValue(null);

    await expect(resolveDocumentOrganizationTheme()).resolves.toBeNull();
  });

  it("does not fail the document when theme lookup throws", async () => {
    getSessionMock.mockRejectedValue(new Error("session unavailable"));

    await expect(resolveDocumentOrganizationTheme()).resolves.toBeNull();
  });
});
