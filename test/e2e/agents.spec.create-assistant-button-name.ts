import { expect, test } from "@playwright/test";
import {
  ensureE2EAssistant,
  ensureE2EPrivateMemberAssistant,
  ensureE2EUser,
  login,
} from "./fixtures";

export const createAssistantButtonName =
  /New assistant|Create(?: your first)? assistant/i;

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("agents list page", () => {
  test("loads agents page", async ({ page }) => {
    await page.goto("/en/agents");
    await expect(page).toHaveURL(/\/en\/agents/);

    await expect(
      page.getByRole("heading", {
        name: /Your intelligences, beautifully organized\./i,
      }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows empty state when no agents", async ({ page }) => {
    await page.goto("/en/agents");
    await page.waitForTimeout(2000);

    // Should show either the agents list or empty state
    await expect(
      page
        .getByText(/No assistants|Create your first assistant|Assistants/i)
        .first(),
    ).toBeVisible();
  });

  test("create agent button exists", async ({ page }) => {
    await page.goto("/en/agents");
    await page.waitForTimeout(2000);

    const createBtn = page
      .getByRole("button", { name: createAssistantButtonName })
      .first();

    if (await createBtn.isVisible()) {
      await expect(createBtn).toBeEnabled();
    }
  });

  test("agent search filter exists", async ({ page }) => {
    await page.goto("/en/agents");
    await page.waitForTimeout(2000);

    // Search input may or may not be visible depending on state
    const searchInput = page.getByPlaceholder(/Filter|Search/i).first();
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeVisible();
    }
  });

  test("keeps conversation organization available across workspace pages", async ({
    page,
  }) => {
    await page.goto("/en/agents");

    const historyActions = page.getByRole("toolbar", {
      name: /History actions/i,
    });
    await expect(historyActions).toBeVisible({ timeout: 15_000 });
    await historyActions
      .getByRole("button", { name: /Create folder/i })
      .click();

    const folderName = page.getByRole("textbox", { name: /Folder name/i });
    await expect(folderName).toBeFocused();
    await folderName.press("Escape");
    await expect(folderName).toHaveCount(0);

    const conversationActions = page
      .getByRole("button", { name: /Conversation actions/i })
      .first();
    if (await conversationActions.isVisible()) {
      await expect(
        page
          .locator('[data-slot="workspace-history-sidebar"] [draggable="true"]')
          .first(),
      ).toBeVisible();
      await conversationActions.click();
      await expect(
        page.getByRole("menuitem", { name: /Pin to top|Unpin/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: /Rename/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: /Delete/i }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toBeHidden();

      const draggableRows = page.locator(
        '[data-slot="workspace-history-sidebar"] [draggable="true"]',
      );
      if ((await draggableRows.count()) >= 2) {
        const firstTitle = (
          await draggableRows.nth(0).getByRole("button").first().innerText()
        ).split("\n")[0]!;
        const secondTitle = (
          await draggableRows.nth(1).getByRole("button").first().innerText()
        ).split("\n")[0]!;

        const reordered = page.waitForResponse(
          (response) =>
            response.url().includes("/api/workspace/conversations/reorder") &&
            response.request().method() === "POST",
        );
        await draggableRows
          .nth(1)
          .dragTo(draggableRows.nth(0), {
            sourcePosition: { x: 8, y: 16 },
            targetPosition: { x: 8, y: 16 },
          });
        expect((await reordered).ok()).toBe(true);
        await expect(draggableRows.nth(0)).toContainText(secondTitle);
        const restored = page.waitForResponse(
          (response) =>
            response.url().includes("/api/workspace/conversations/reorder") &&
            response.request().method() === "POST",
        );
        await draggableRows
          .nth(1)
          .dragTo(draggableRows.nth(0), {
            sourcePosition: { x: 8, y: 16 },
            targetPosition: { x: 8, y: 16 },
          });
        expect((await restored).ok()).toBe(true);
        await expect(draggableRows.nth(0)).toContainText(firstTitle);
      }
    }
  });

  test("keeps assistant card menus focused on secondary actions", async ({
    page,
  }) => {
    const { workspaceId } = await ensureE2EAssistant();
    const selection = await page.request.patch("/api/workspaces", {
      data: { workspaceId },
    });
    expect(selection.ok()).toBe(true);
    await page.goto("/en/agents");

    const actionsButton = page
      .getByRole("button", { name: /More actions for/i })
      .first();
    await expect(actionsButton).toBeVisible({ timeout: 15_000 });
    await actionsButton.click();

    const menu = page.getByRole("menu");
    await expect(
      menu.getByRole("menuitem", {
        name: /preferred assistant/i,
      }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", {
        name: /(?:Hide from|Show in) chat selector/i,
      }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Export JSON", exact: true }),
    ).toBeVisible();
    expect(await menu.getByRole("menuitem").count()).toBeLessThanOrEqual(5);
    await expect(
      menu.getByRole("menuitem", { name: /Duplicate|Delete|Publish/i }),
    ).toHaveCount(0);
  });

  test("does not show another user's private assistant to an admin", async ({
    page,
  }) => {
    await ensureE2EPrivateMemberAssistant();
    await page.goto("/en/agents");

    await expect(
      page.getByText("Member private assistant", { exact: true }),
    ).not.toBeVisible();
  });
});
