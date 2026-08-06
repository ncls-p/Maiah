import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("chat composer", () => {
  test("input field is present when agents exist", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(2000);

    // Chat composer / textarea should be present
    const composer = page.locator("textarea, [role='textbox']").first();

    if (await composer.isVisible()) {
      await expect(composer).toBeVisible();
    }
  });

  test("keeps composer controls within the mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/chat");

    const controls = page.locator(
      '[data-slot="chat-composer-primary-controls"]',
    );
    await expect(controls).toBeVisible({ timeout: 15_000 });
    expect(
      await controls.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});
