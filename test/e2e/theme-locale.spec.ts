import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("theme toggle", () => {
  test("theme toggle button exists in sidebar", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(1000);

    // Theme toggle should be in the sidebar footer
    const themeToggle = page
      .getByRole("button", { name: /Toggle theme/i })
      .first();
    await expect(themeToggle).toBeVisible({ timeout: 15_000 });
  });

  test("theme toggle button changes theme", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(1000);

    // Find theme toggle in the sidebar
    const themeButton = page
      .getByRole("button", { name: /Toggle theme/i })
      .first();
    await expect(themeButton).toBeVisible({ timeout: 15_000 });
    const beforeDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    await themeButton.click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.classList.contains("dark"),
        ),
      )
      .toBe(!beforeDark);
  });

  test("theme persists across page navigation", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(1000);

    const themeButton = page
      .getByRole("button", { name: /Toggle theme/i })
      .first();
    await expect(themeButton).toBeVisible({ timeout: 15_000 });
    await themeButton.click();
    const selectedDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    // Navigate to another page
    await page.getByRole("link", { name: "Chat", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/chat/);

    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.classList.contains("dark"),
        ),
      )
      .toBe(selectedDark);
  });
});

test.describe("locale switcher", () => {
  test("locale switcher exists in sidebar", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(1000);

    const sidebar = page.getByRole("complementary").first();
    const localeSwitcher = sidebar.getByRole("group", { name: /Language/i });
    await expect(localeSwitcher).toBeVisible({ timeout: 15_000 });
  });

  test("locale switcher shows current locale", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(1000);

    const englishButton = page
      .getByRole("complementary")
      .first()
      .getByRole("button", {
        name: "English",
        exact: true,
      });
    await expect(englishButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15_000,
    });
  });

  test("switch to French locale", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(1000);

    const frenchButton = page
      .getByRole("complementary")
      .first()
      .getByRole("button", {
        name: "French",
        exact: true,
      });
    await expect(frenchButton).toBeVisible();
    await frenchButton.click();
    await expect(page).toHaveURL(/\/fr\/settings/, { timeout: 10_000 });
  });
});
