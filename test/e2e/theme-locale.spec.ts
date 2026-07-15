import { expect, type Page, test } from "@playwright/test";
import { e2eUser, ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: e2eUser.name, exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test.describe("theme toggle", () => {
  test("theme toggle button exists in sidebar", async ({ page }) => {
    await page.goto("/en/settings");
    await openAccountMenu(page);
    const themeToggle = page.getByRole("menuitem", { name: /Toggle theme/i });
    await expect(themeToggle).toBeVisible({ timeout: 15_000 });
  });

  test("theme toggle button changes theme", async ({ page }) => {
    await page.goto("/en/settings");
    await openAccountMenu(page);
    const themeButton = page.getByRole("menuitem", { name: /Toggle theme/i });
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
    await openAccountMenu(page);
    const themeButton = page.getByRole("menuitem", { name: /Toggle theme/i });
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
    await openAccountMenu(page);
    const localeSwitcher = page.getByRole("menuitem", {
      name: /Language.*English/i,
    });
    await expect(localeSwitcher).toBeVisible({ timeout: 15_000 });
  });

  test("locale switcher shows current locale", async ({ page }) => {
    await page.goto("/en/settings");
    await openAccountMenu(page);
    await expect(
      page.getByRole("menuitem", { name: /Language.*English/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("switch to French locale", async ({ page }) => {
    await page.goto("/en/settings");
    await openAccountMenu(page);
    const languageButton = page.getByRole("menuitem", {
      name: /Language.*English/i,
    });
    await expect(languageButton).toBeVisible();
    await languageButton.click();
    await expect(page).toHaveURL(/\/fr\/settings/, { timeout: 10_000 });
  });
});
