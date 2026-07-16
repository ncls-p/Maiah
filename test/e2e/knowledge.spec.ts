import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("knowledge bases", () => {
  test("loads knowledge page", async ({ page }) => {
    await page.goto("/en/knowledge");
    await expect(page).toHaveURL(/\/en\/knowledge/);

    await expect(
      page.getByRole("heading", { name: "Documents", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows the document collections state", async ({ page }) => {
    await page.goto("/en/knowledge");

    await expect(
      page.getByText("No document collections yet", { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("create collection button exists", async ({ page }) => {
    await page.goto("/en/knowledge");

    const createBtn = page
      .getByRole("button", {
        name: /^(?:New collection|Create a collection)$/i,
      })
      .first();
    await expect(createBtn).toBeEnabled({ timeout: 10_000 });
  });

  test("document collection CRUD flow", async ({ page }) => {
    await page.goto("/en/knowledge");

    const testBaseName = `E2E KB ${Date.now()}`;

    const createBtn = page
      .getByRole("button", {
        name: /^(?:New collection|Create a collection)$/i,
      })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
    await createBtn.click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel(/^Name$/i).fill(testBaseName);
    await createDialog.getByRole("button", { name: /^Create$/i }).click();

    const baseButton = page.getByRole("button", {
      name: new RegExp(`^${testBaseName} Private$`),
    });
    await expect(baseButton).toBeVisible({ timeout: 15_000 });

    await baseButton.hover();
    await page.getByRole("button", { name: `Delete ${testBaseName}` }).click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog.getByText(testBaseName)).toBeVisible();
    await deleteDialog.getByRole("button", { name: /^Delete$/i }).click();
    await expect(baseButton).not.toBeVisible({ timeout: 15_000 });
  });
});
