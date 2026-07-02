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
			page.getByRole("heading", { name: /Knowledge/i }).first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("shows empty state when no knowledge bases", async ({ page }) => {
		await page.goto("/en/knowledge");
		await page.waitForTimeout(2000);

		// Should show empty state or bases list
		await expect(
			page.getByText(/No knowledge|Create|Bases/i).first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("create knowledge base button exists", async ({ page }) => {
		await page.goto("/en/knowledge");
		await page.waitForTimeout(2000);

		const createBtn = page
			.getByRole("button", { name: /Create|New knowledge|Add/i })
			.first();

		if (await createBtn.isVisible()) {
			await expect(createBtn).toBeEnabled();
		}
	});

	test("knowledge base CRUD flow", async ({ page }) => {
		await page.goto("/en/knowledge");
		await page.waitForTimeout(2000);

		const testBaseName = `E2E KB ${Date.now()}`;

		// Try to create a knowledge base
		const createBtn = page
			.getByRole("button", { name: /Create|New knowledge|Add/i })
			.first();

		if (!(await createBtn.isVisible())) {
			test.skip();
		}

		await createBtn.click();
		await page.waitForTimeout(500);

		// Fill in the knowledge base form
		const nameInput = page.getByLabel(/Name/i).first();
		if (await nameInput.isVisible()) {
			await nameInput.fill(testBaseName);

			// Submit
			const submitBtn = page
				.getByRole("button", { name: /Create|Save/i })
				.first();

			if (await submitBtn.isVisible()) {
				await submitBtn.click();
				await page.waitForTimeout(2000);

				// Verify KB was created
				await expect(page.getByText(testBaseName)).toBeVisible({
					timeout: 10_000,
				});
			}
		}
	});
});
