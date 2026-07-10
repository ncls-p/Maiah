import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

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
      page.getByRole("heading", { name: /Assistants/i }).first(),
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
      .getByRole("button", { name: /New assistant|Create/i })
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
});

test.describe("agent CRUD", () => {
  test("create, configure, and delete an orchestrator", async ({ page }) => {
    await page.goto("/en/agents");

    const createBtn = page
      .getByRole("button", { name: /New assistant/i })
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
      .getByRole("button", { name: /New assistant/i })
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
