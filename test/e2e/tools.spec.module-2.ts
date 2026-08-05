import { expect,test } from "@playwright/test";

test.describe("retired custom tools builder", () => {
  test("redirects old custom tools links to workflows", async ({ page }) => {
    await page.goto("/en/custom-tools");
    await expect(page).toHaveURL(/\/en\/workflows/);
  });

  test("does not expose a custom tools tab", async ({ page }) => {
    await page.goto("/en/tools");
    await expect(page.getByRole("tab", { name: "Custom", exact: true })).toHaveCount(0);
  });
});

test.describe("scheduled tasks page", () => {
  test("loads scheduled tasks page", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await expect(page).toHaveURL(/\/en\/scheduled-tasks/);

    await expect(
      page.getByRole("heading", {
        name: /Automate, without losing control\./i,
      }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows scheduled tasks empty state", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await page.waitForTimeout(2000);

    await expect(page.getByText(/Scheduled tasks|No scheduled|Create/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("scheduled tasks page description exists", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await page.waitForTimeout(2000);

    // Should have a description about scheduling
    await expect(page.getByText(/Schedule|automatic|assistants/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
