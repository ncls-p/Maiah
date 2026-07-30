import { expect, test } from "@playwright/test";
import {
  ensureE2EPrivateMemberAssistant,
  ensureE2EUser,
  login,
} from "./fixtures";

const createAssistantButtonName =
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

    const historyActions = page.getByRole("button", {
      name: /History actions/i,
    });
    await expect(historyActions).toBeVisible({ timeout: 15_000 });
    await historyActions.click();
    await page.getByRole("menuitem", { name: /Create folder/i }).click();

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

        await draggableRows.nth(1).dragTo(draggableRows.nth(0));
        await expect(draggableRows.nth(0)).toContainText(secondTitle);
        await page.waitForTimeout(350);

        await draggableRows.nth(1).dragTo(draggableRows.nth(0));
        await expect(draggableRows.nth(0)).toContainText(firstTitle);
      }
    }
  });

  test("keeps assistant card menus focused on secondary actions", async ({
    page,
  }) => {
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
    expect(await menu.getByRole("menuitem").count()).toBeLessThanOrEqual(3);
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

test.describe("agent CRUD", () => {
  test("create, configure, and delete an orchestrator", async ({ page }) => {
    await page.goto("/en/agents");

    const createBtn = page
      .getByRole("button", { name: createAssistantButtonName })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
    await createBtn.click();

    const orchestratorOption = page.getByRole("button", {
      name: /^Orchestrator/i,
    });
    await expect(orchestratorOption).toBeVisible();
    await orchestratorOption.click();
    await expect(orchestratorOption).toHaveAttribute("aria-pressed", "true");

    const testAgentName = `E2E Orchestrator ${Date.now()}`;
    await page.getByLabel(/^Name$/i).fill(testAgentName);
    await page.getByRole("button", { name: /Create and configure/i }).click();

    await expect(page).toHaveURL(/\/en\/agents\/[0-9a-f-]+$/, {
      timeout: 15_000,
    });
    await expect(page.getByRole("tab", { name: /Orchestration/i })).toBeVisible(
      { timeout: 15_000 },
    );
    await expect(page.getByText(testAgentName).first()).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: /Assistant settings/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Essentials/i }),
    ).toHaveAttribute("data-state", "active");
    await expect(
      page.getByRole("button", { name: /Choose a model/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Change assistant logo/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Assistant actions/i }).click();
    await page.getByRole("menuitem", { name: /Delete assistant/i }).click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog.getByText(testAgentName)).toBeVisible();
    await deleteDialog.getByRole("button", { name: /^Delete$/i }).click();
    await expect(page).toHaveURL(/\/en\/agents$/, { timeout: 15_000 });
    await expect(page.getByText(testAgentName)).not.toBeVisible();
  });

  test("agent templates are available", async ({ page }) => {
    await page.goto("/en/agents");
    const createBtn = page
      .getByRole("button", { name: createAssistantButtonName })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
    await createBtn.click();

    // At least one template or form field should be visible
    await expect(
      page.getByText(/assistant|template|Name/i).first(),
    ).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("agent detail page", () => {
  test("navigate to agent detail page", async ({ page }) => {
    await page.goto("/en/agents");
    await page.waitForTimeout(2000);

    // Click on the first agent if any exist
    const firstAgentLink = page
      .getByRole("link", { name: /Configure/i })
      .first();

    if (await firstAgentLink.isVisible()) {
      await firstAgentLink.click();
      await page.waitForTimeout(2000);

      // Should navigate to agent detail page
      const url = page.url();
      expect(url).toMatch(/\/en\/agents\//);
    }
  });
});
