import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import {
  expectNoOverlap,
  expectShareDialogReleasesPage,
  injectConversationImpact,
  uploadCodeWorkspace,
  WORKSPACE_VERSION,
} from "./code-workspace-fixtures";
import { ensureE2EUser, login } from "./fixtures";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("code workspace mode", () => {
  // The test uploads a real workspace and drives several viewports.
  test.describe.configure({ timeout: 120_000 });

  test("keeps the composer actions usable in the narrow coding pane and on mobile", async ({
    page,
  }) => {
    const conversationId = await uploadCodeWorkspace(page);
    await injectConversationImpact(page, conversationId);

    // Desktop split view: the chat pane is narrow while the viewport is wide.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/en/chat?conversationId=${conversationId}`);
    await expect(page.getByText(WORKSPACE_VERSION)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Coding" }).click();
    const composer = page.locator(".composer-box");
    await expect(composer).toBeVisible();
    // Narrow the chat pane as far as it goes.
    const splitter = page.getByRole("separator", {
      name: "Resize the Coding mode chat",
    });
    await expect(splitter).toBeVisible();
    await splitter.focus();
    await page.keyboard.press("Home");
    const send = page.getByRole("button", { name: "Send message" });
    const impact = page.locator('[data-slot="chat-composer-impact-trigger"]');
    const share = page.getByRole("button", { name: "Share conversation" });
    await expect(impact).toBeVisible({ timeout: 15_000 });
    await expect(share).toBeVisible();
    await expectNoOverlap(page, impact, send);
    await expectNoOverlap(page, share, send);
    const primary = page.locator(
      '[data-slot="chat-composer-primary-controls"]',
    );
    expect(
      await primary.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);

    // The usage chip opens its details on click (no hover needed).
    await impact.click();
    const popover = page.locator('[data-slot="popover-content"]');
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("1,200");
    await expect(popover).toContainText("340");
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();

    // Sharing then closing the dialog must leave the page interactive.
    await expectShareDialogReleasesPage(page, composer);

    // Mobile: the workbench stacks above the docked composer.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(impact).toBeVisible();
    await expect(share).toBeVisible();
    await expectNoOverlap(page, impact, send);
    await expectNoOverlap(page, share, send);
    const workbench = page.getByRole("group", { name: "Workspace panels" });
    const [workbenchBox, composerBox] = await Promise.all([
      workbench.boundingBox(),
      composer.boundingBox(),
    ]);
    expect(workbenchBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    expect(workbenchBox!.y).toBeLessThan(composerBox!.y);
    expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(844 + 1);
    await expectShareDialogReleasesPage(page, composer);
  });
});
