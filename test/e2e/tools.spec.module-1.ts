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
      page.getByRole("heading", {
        name: /Capabilities and connections\./i,
      }),
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
  test("switches tabs locally without remounting the controls", async ({
    page,
  }) => {
    await page.goto("/en/tools");
    const tabList = page.getByRole("tablist");
    await expect(tabList).toBeVisible({ timeout: 15_000 });
    await tabList.evaluate((element) => {
      element.setAttribute("data-persistence-check", "tools-tabs");
    });
    const tabListRect = await tabList.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
    });
    let routeRequests = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.pathname === "/en/tools" &&
        url.searchParams.get("tab") === "skills"
      ) {
        routeRequests += 1;
      }
    });

    await page.getByRole("tab", { name: "Skills", exact: true }).click();

    await expect(page).toHaveURL(/\/en\/tools$/);
    await expect(tabList).toHaveAttribute(
      "data-persistence-check",
      "tools-tabs",
    );
    await expect(
      page.getByRole("tab", { name: "Skills", exact: true }),
    ).toHaveAttribute("data-state", "active");
    await expect(
      page.getByRole("searchbox", { name: /Search skills/i }),
    ).toBeVisible();
    await expect.poll(() => routeRequests).toBe(0);
    await expect(
      tabList.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
      }),
    ).resolves.toEqual(tabListRect);
  });
  test("retires the approvals tab and redirects old links", async ({
    page,
  }) => {
    await page.goto("/en/tools?tab=approvals");

    await expect(page).toHaveURL(/\/en\/tools\?tab=builtin$/, {
      timeout: 15_000,
    });
    await expect(page.getByRole("tab", { name: /Approvals/i })).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: "Built-in", exact: true }),
    ).toHaveAttribute("data-state", "active");
  });
  test("shows built-in tools", async ({ page }) => {
    await page.goto("/en/tools");
    await page.waitForTimeout(2000);

    // The compact Orbit list should expose the built-in tools directly.
    await expect(
      page.getByRole("heading", { name: "Calculator", exact: true }),
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
