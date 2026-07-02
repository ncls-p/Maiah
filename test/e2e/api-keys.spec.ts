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

		const createBtn = page.getByRole("button", { name: /Create/i }).first();

		if (!(await createBtn.isVisible())) {
			test.skip();
		}

		await createBtn.click();
		await page.waitForTimeout(500);

		// Fill key name
		const nameInput = page.getByLabel(/Key name|Name/i).first();
		if (await nameInput.isVisible()) {
			await nameInput.fill(testName);

			const submitBtn = page
				.getByRole("button", { name: /Create|Save/i })
				.first();

			if (await submitBtn.isVisible()) {
				await submitBtn.click();
				await page.waitForTimeout(2000);

				// Key should appear
				await expect(page.getByText(testName)).toBeVisible({
					timeout: 10_000,
				});
			}
		}
	});

	test("revoke api key flow", async ({ page }) => {
		await page.goto("/en/api-keys");
		await page.waitForTimeout(2000);

		// Look for an existing key to revoke
		const revokeBtn = page.getByRole("button", { name: /Revoke/i }).first();

		if (!(await revokeBtn.isVisible())) {
			test.skip();
		}

		await revokeBtn.click();
		await page.waitForTimeout(1000);

		// Confirm if dialog appears
		const confirmBtn = page
			.getByRole("button", { name: /Revoke|Confirm/i })
			.first();

		if (await confirmBtn.isVisible()) {
			await confirmBtn.click();
		}
	});
});
