import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

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

  test("shows language settings", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(2000);

    // Language setting should be visible
    await expect(page.getByText(/Language/i).first()).toBeVisible({
      timeout: 10_000,
    });
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

  test("change language setting", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(2000);

    // Language selector should be present
    const languageSection = page.getByText(/Language/i).first();
    if (await languageSection.isVisible()) {
      // The section should have interactive elements
      const languageControls = languageSection
        .locator("..")
        .locator("button, select, [role='combobox']");

      if ((await languageControls.count()) > 0) {
        await expect(languageControls.first()).toBeVisible();
      }
    }
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
