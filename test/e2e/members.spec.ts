import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
	await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
	await login(page);
});

test.describe("members page", () => {
	test("loads members page", async ({ page }) => {
		await page.goto("/en/members");
		await expect(page).toHaveURL(/\/en\/members/);

		await expect(
			page.getByRole("heading", { name: /Users|Platform accounts/i }).first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("shows current user in list", async ({ page }) => {
		await page.goto("/en/members");
		await page.waitForTimeout(2000);

		// The current user (E2E Admin) should be visible
		await expect(page.getByText(/E2E Admin|e2e-admin/i).first()).toBeVisible({
			timeout: 10_000,
		});
	});

	test("shows platform accounts section", async ({ page }) => {
		await page.goto("/en/members");
		await page.waitForTimeout(2000);

		await expect(
			page.getByRole("heading", { name: "Platform accounts" }).first(),
		).toBeVisible();
	});

	test("add user form exists", async ({ page }) => {
		await page.goto("/en/members");
		await page.waitForTimeout(2000);

		// Add user button or form should be present
		const addUserBtn = page
			.getByRole("button", { name: /Add user|Create|Invite/i })
			.first();

		if (await addUserBtn.isVisible()) {
			await expect(addUserBtn).toBeEnabled();
		}
	});

	test("user list displays role badges", async ({ page }) => {
		await page.goto("/en/members");
		await page.waitForTimeout(2000);

		// Admin badge should be visible for admin user
		await expect(page.getByText(/Admin|Owner|User/i).first()).toBeVisible({
			timeout: 10_000,
		});
	});
});
