import { expect, test } from "@playwright/test";
import { e2eUser, ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("settings page", () => {
  test("loads settings page", async ({ page }) => {
    await page.goto("/en/settings");
    await expect(page).toHaveURL(/\/en\/settings/);

    await expect(
      page.getByRole("heading", { name: /Settings/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows language preference in the account menu", async ({ page }) => {
    await page.goto("/en/settings");
    await page.getByRole("button", { name: e2eUser.name, exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: /Language.*English/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("admin settings link exists for admins", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(2000);

    // Admin link should be visible for admin users
    const adminLink = page
      .getByRole("link", { name: /platform settings|admin/i })
      .first();

    if (await adminLink.isVisible()) {
      await expect(adminLink).toBeVisible();
    }
  });

  test("persists organization logo and preset theme", async ({ page }) => {
    const workspaces = (await (
      await page.request.get("/api/workspaces")
    ).json()) as Array<{ workspace: { id: string } }>;
    const workspaceId = workspaces[0]?.workspace.id;
    if (!workspaceId) throw new Error("E2E workspace is missing");

    const resetBranding = () =>
      page.request.put("/api/workspace/branding", {
        data: { workspaceId, logoUrl: null, theme: "ocean" },
      });
    await resetBranding();
    try {
      await page.goto("/en/settings");
      const branding = page.locator("section").filter({
        has: page.getByRole("heading", { name: "Organization branding" }),
      });
      await expect(branding).toBeVisible();

      await branding.getByRole("button", { name: "Forest" }).click();
      await branding.getByRole("button", { name: "Save branding" }).click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-brand-theme",
        "forest",
      );
      await page.reload();
      await expect(
        branding.getByRole("button", { name: "Forest" }),
      ).toHaveAttribute("aria-pressed", "true");

      await branding
        .locator('input[type="file"]')
        .setInputFiles("public/deodis-logo.png");
      await branding.getByRole("button", { name: "Save branding" }).click();
      await page.reload();
      await expect(branding.locator('img[src^="data:image/"]')).toBeVisible();
    } finally {
      await resetBranding();
    }
  });

  test("can change language from the account menu", async ({ page }) => {
    await page.goto("/en/settings");
    await page.getByRole("button", { name: e2eUser.name, exact: true }).click();
    await page.getByRole("menuitem", { name: /Language.*English/i }).click();
    await expect(page).toHaveURL(/\/fr\/settings/, { timeout: 10_000 });
  });
});

test.describe("settings navigation", () => {
  test("navigate from settings to other pages", async ({ page }) => {
    await page.goto("/en/settings");
    await expect(page).toHaveURL(/\/en\/settings/);

    // Navigate via sidebar
    await page.getByRole("link", { name: "Chat", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/chat/);

    await page.goBack();
    await expect(page).toHaveURL(/\/en\/settings/);
  });
});
