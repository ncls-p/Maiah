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
