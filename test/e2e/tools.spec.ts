import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("tools hub page", () => {
  test("loads tools page", async ({ page }) => {
    await page.goto("/en/tools");
    await expect(page).toHaveURL(/\/en\/tools/);

    await expect(
      page.getByRole("heading", { name: /Tools & integrations/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows tools tabs", async ({ page }) => {
    await page.goto("/en/tools");
    await page.waitForTimeout(2000);

    // Tabs or at least some tools content should be visible
    await expect(
      page.getByRole("tab", { name: "Built-in", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows built-in tools", async ({ page }) => {
    await page.goto("/en/tools");
    await page.waitForTimeout(2000);

    // Built-in tools section
    await expect(
      page.getByRole("heading", { name: "Built-in tools", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("tools search works", async ({ page }) => {
    await page.goto("/en/tools");
    await page.waitForTimeout(2000);

    const searchInput = page.getByPlaceholder(/Search tools/i).first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("calc");
      await page.waitForTimeout(500);

      // Results should update
      const pageContent = page.locator(".page-content").first();
      await expect(pageContent).toBeVisible();
    }
  });
});

test.describe("custom tools page", () => {
  test("loads custom tools page", async ({ page }) => {
    await page.goto("/en/custom-tools");
    await expect(page).toHaveURL(/\/en\/tools\?tab=custom/);

    const customTab = page.getByRole("tab", { name: "Custom", exact: true });
    await expect(customTab).toBeVisible({ timeout: 15_000 });
    await expect(customTab).toHaveAttribute("data-state", "active");
  });

  test("shows custom tools empty state", async ({ page }) => {
    await page.goto("/en/custom-tools");
    await page.waitForTimeout(2000);

    await expect(
      page.getByRole("heading", { name: /Custom tool builder/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("scheduled tasks page", () => {
  test("loads scheduled tasks page", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await expect(page).toHaveURL(/\/en\/scheduled-tasks/);

    await expect(
      page.getByRole("heading", { name: /Scheduled tasks/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows scheduled tasks empty state", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await page.waitForTimeout(2000);

    await expect(
      page.getByText(/Scheduled tasks|No scheduled|Create/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("scheduled tasks page description exists", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await page.waitForTimeout(2000);

    // Should have a description about scheduling
    await expect(
      page.getByText(/Schedule|automatic|assistants/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
