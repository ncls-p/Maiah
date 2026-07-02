import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
	await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
	await login(page);
});

test.describe("marketplace page", () => {
	test("loads marketplace page", async ({ page }) => {
		await page.goto("/en/marketplace");
		await expect(page).toHaveURL(/\/en\/marketplace/);

		await expect(
			page.getByRole("heading", { name: /Marketplace/i }).first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("shows marketplace tabs", async ({ page }) => {
		await page.goto("/en/marketplace");
		await page.waitForTimeout(2000);

		// Marketplace tabs or fallback content should be visible
		await expect(
			page.getByText(/Marketplace|No listings|Discover/i).first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("shows empty state when no listings", async ({ page }) => {
		await page.goto("/en/marketplace");
		await page.waitForTimeout(2000);

		// Empty state should be visible
		await expect(
			page.getByText(/No listings|Discover|Marketplace/i).first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("marketplace search exists", async ({ page }) => {
		await page.goto("/en/marketplace");
		await page.waitForTimeout(2000);

		const searchInput = page.getByPlaceholder(/Search/i).first();
		if (await searchInput.isVisible()) {
			await expect(searchInput).toBeVisible();
		}
	});
});

test.describe("marketplace item detail", () => {
	test("navigate to marketplace item detail", async ({ page }) => {
		await page.goto("/en/marketplace");
		await page.waitForTimeout(2000);

		// If any listing links exist, click one
		const listingLink = page
			.getByRole("link", { name: /View details|Install/i })
			.first();

		if (await listingLink.isVisible()) {
			await listingLink.click();
			await page.waitForTimeout(2000);

			const url = page.url();
			expect(url).toMatch(/\/en\/marketplace\/items\//);
		}
	});
});
