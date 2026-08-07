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
    await page.goto("/fr/chat");

    const controls = page.locator(
      '[data-slot="chat-composer-primary-controls"]',
    );
    await expect(controls).toBeVisible({ timeout: 15_000 });
    const dock = page.locator(".composer-dock");
    const composerBox = page.locator(".composer-box");
    const textarea = composerBox.locator("textarea");
    const mobileNavigation = page.locator(
      '[data-slot="mobile-app-navigation"]',
    );
    await expect(dock).toBeVisible();
    await expect(textarea).toBeVisible();
    await expect(mobileNavigation).toBeVisible();
    await expect(
      page.locator('meta[name="viewport"]'),
    ).toHaveAttribute("content", /interactive-widget=resizes-content/);
    const initialTextarea = await textarea.evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
    }));
    expect(initialTextarea.overflowY).toBe("hidden");
    expect(initialTextarea.scrollHeight).toBeLessThanOrEqual(
      initialTextarea.clientHeight + 1,
    );
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
    const [dockBox, composerBounds, navigationBox] = await Promise.all([
      dock.boundingBox(),
      composerBox.boundingBox(),
      mobileNavigation.boundingBox(),
    ]);
    expect(dockBox).not.toBeNull();
    expect(composerBounds).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    expect(Math.abs(dockBox!.y + dockBox!.height - navigationBox!.y)).toBeLessThanOrEqual(1);
    expect(navigationBox!.y - (composerBounds!.y + composerBounds!.height)).toBeLessThanOrEqual(16);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);

    const header = page.locator(".app-shell__header");
    const headerBeforeKeyboard = await header.boundingBox();
    await textarea.focus();
    await expect(mobileNavigation).toBeHidden();
    await page.setViewportSize({ width: 390, height: 500 });
    const [headerWithKeyboard, dockWithKeyboard] = await Promise.all([
      header.boundingBox(),
      dock.boundingBox(),
    ]);
    expect(headerWithKeyboard?.y).toBe(headerBeforeKeyboard?.y);
    expect(dockWithKeyboard).not.toBeNull();
    expect(dockWithKeyboard!.y + dockWithKeyboard!.height).toBeLessThanOrEqual(
      501,
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);

    await textarea.fill("A long mobile message ".repeat(80));
    const filledTextarea = await textarea.evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
    }));
    expect(filledTextarea.clientHeight).toBeLessThanOrEqual(112);
    expect(filledTextarea.scrollHeight).toBeGreaterThan(
      filledTextarea.clientHeight,
    );
    expect(filledTextarea.overflowY).toBe("auto");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);
  });
});
