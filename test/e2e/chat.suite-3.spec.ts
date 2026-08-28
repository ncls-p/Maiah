import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";

import { activate, ensureE2EUser, login } from "./fixtures";
import { createRecoveredToolConversation } from "./chat.suite-3.helpers";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("chat page", () => {
  test("shows recovered tool failures as completed with warnings", async ({
    page,
  }) => {
    const fixture = await createRecoveredToolConversation();
    try {
      await page.goto(
        `/en/chat?agentId=${fixture.agentId}&conversationId=${fixture.conversationId}`,
      );

      const transcript = page.getByRole("region", { name: "Chat transcript" });
      await expect(
        transcript.getByText("Work completed with warnings", { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        transcript.getByText("Work interrupted", { exact: true }),
      ).toHaveCount(0);
      await expect(
        transcript.getByRole("button", { name: "Regenerate response" }),
      ).toBeVisible();
      await expect(
        transcript.getByRole("button", { name: "Continue this response" }),
      ).toBeVisible();
      await expect(
        transcript.locator(
          'button[aria-label="Regenerate response"] + button[aria-label="Continue this response"]',
        ),
      ).toHaveCount(1);

      await activate(
        transcript.getByRole("button", { name: "Show work phase" }),
      );
      await expect(
        transcript.getByText("Failed", { exact: true }),
      ).toBeVisible();
      await expect(
        transcript.getByText("Completed", { exact: true }).first(),
      ).toBeVisible();
      const detailedReasoning = transcript.locator(
        '[data-reasoning-details="available"]',
      );
      await expect(detailedReasoning).toBeVisible();
      await activate(
        detailedReasoning.getByRole("button", { name: "View", exact: true }),
      );
      await expect(
        detailedReasoning.getByText(
          "Inspect the failed query before preparing a corrected retry.",
          { exact: true },
        ),
      ).toBeVisible();
      const compactReasoning = transcript.locator(
        '[data-reasoning-details="unavailable"]',
      );
      await expect(compactReasoning).toBeVisible();
      await expect(
        compactReasoning.getByText("Reasoning complete", { exact: true }),
      ).toBeVisible();
      await expect(
        compactReasoning.getByRole("button", { name: "View", exact: true }),
      ).toHaveCount(0);
      await expect(
        transcript.getByRole("region", {
          name: "Investigation",
          exact: true,
        }),
      ).toHaveCount(0);

      const todoDock = page.getByRole("region", {
        name: "Investigation",
        exact: true,
      });
      await expect(todoDock).toBeVisible();
      const todoProgress = todoDock.getByRole("progressbar", {
        name: "Investigation progress",
      });
      await expect(todoProgress).toHaveAttribute("aria-valuenow", "1");
      await expect(todoProgress).toHaveAttribute("aria-valuemax", "2");

      // The dock starts expanded: task details are visible right away.
      await expect(
        todoDock.getByText("1/2 tasks completed", { exact: true }),
      ).toBeVisible();
      const currentTask = todoDock.locator('[aria-current="step"]');
      await expect(currentTask).toContainText("Verify the fix");
      await expect(currentTask).toContainText("In progress");

      const composer = page.getByRole("textbox", { name: "Message" });
      const [dockBox, composerBox] = await Promise.all([
        todoDock.boundingBox(),
        composer.boundingBox(),
      ]);
      expect(dockBox).not.toBeNull();
      expect(composerBox).not.toBeNull();
      expect(dockBox!.y + dockBox!.height).toBeLessThanOrEqual(composerBox!.y);

      // Collapsing swaps the list for the current-task teaser in the header.
      await todoDock.getByRole("button", { name: "Hide task details" }).click();
      await expect(
        todoDock.getByText("1/2 tasks completed", { exact: true }),
      ).toBeHidden();
      await expect(todoDock.getByText("Verify the fix")).toBeVisible();
      await todoDock.getByRole("button", { name: "Show task details" }).click();
      await expect(
        todoDock.getByText("1/2 tasks completed", { exact: true }),
      ).toBeVisible();

      await todoDock.getByRole("button", { name: "Hide plan" }).click();
      await expect(todoDock).toBeHidden();
      const showPlan = page.getByRole("button", { name: "Show plan" });
      await expect(showPlan).toBeVisible();
      await showPlan.click();
      await expect(todoDock).toBeVisible();
      // Re-showing the plan restores the expanded presentation.
      await expect(
        todoDock.getByRole("button", { name: "Hide task details" }),
      ).toBeVisible();

      const transcriptViewport = page.locator(
        '[data-slot="message-scroller-viewport"]',
      );
      await transcriptViewport.hover();
      await page.mouse.wheel(0, -200);
      await expect(todoDock).toBeVisible();
      await expect(
        todoDock.getByRole("button", { name: "Hide task details" }),
      ).toBeVisible();
      await expect(showPlan).toBeHidden();

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(todoDock).toBeVisible();
      await expect(composer).toBeVisible();
      const mobileDockBox = await todoDock.boundingBox();
      expect(mobileDockBox).not.toBeNull();
      expect(mobileDockBox!.x).toBeGreaterThanOrEqual(0);
      expect(mobileDockBox!.x + mobileDockBox!.width).toBeLessThanOrEqual(390);
    } finally {
      await fixture.cleanup();
    }
  });
});
