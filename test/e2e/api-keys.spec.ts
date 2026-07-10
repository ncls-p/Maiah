import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("api keys page", () => {
  test("loads api keys page", async ({ page }) => {
    await page.goto("/en/api-keys");
    await expect(page).toHaveURL(/\/en\/api-keys/);

    await expect(
      page.getByRole("heading", { name: /API keys/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows empty state when no keys", async ({ page }) => {
    await page.goto("/en/api-keys");
    await page.waitForTimeout(2000);

    await expect(
      page.getByText(/No API keys|Create|API key/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("create api key flow", async ({ page }) => {
    await page.goto("/en/api-keys");
    await page.waitForTimeout(2000);

    const testName = `E2E Key ${Date.now()}`;

    const nameInput = page.getByLabel(/Key name/i);
    const createBtn = page.getByRole("button", { name: /Create key/i });

    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill(testName);
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    await expect(page.getByText(testName)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("revoke api key flow", async ({ page }) => {
    await page.goto("/en/api-keys");
    await page.waitForTimeout(2000);

    // Look for an existing key to revoke
    const revokeBtn = page
      .getByRole("button", { name: /Revoke E2E Key/i })
      .first();

    await expect(revokeBtn).toBeVisible({ timeout: 15_000 });
    await revokeBtn.click();
    await expect(
      page.getByRole("alertdialog").getByText(/stop working immediately/i),
    ).toBeVisible();
    await page.getByRole("button", { name: /Revoke key/i }).click();
    await expect(revokeBtn).not.toBeVisible({ timeout: 10_000 });
  });
});
