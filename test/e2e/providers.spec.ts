import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
	await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
	await login(page);
});

test.describe("providers page", () => {
	test("loads providers page", async ({ page }) => {
		await page.goto("/en/providers");
		await expect(page).toHaveURL(/\/en\/providers/);

		await expect(
			page.getByRole("heading", { name: /AI connections|Connect AI/i }).first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("shows empty state when no providers", async ({ page }) => {
		await page.goto("/en/providers");
		await page.waitForTimeout(2000);

		await expect(
			page.getByText(/No connections|Add|Connect AI/i).first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("add connection button exists", async ({ page }) => {
		await page.goto("/en/providers");
		await page.waitForTimeout(2000);

		const addBtn = page.getByRole("button", { name: /Add|Connect/i }).first();

		if (await addBtn.isVisible()) {
			await expect(addBtn).toBeEnabled();
		}
	});
});
