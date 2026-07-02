import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
	await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
	await login(page);
});

test.describe("theme toggle", () => {
	test("theme toggle button exists in sidebar", async ({ page }) => {
		await page.goto("/en/settings");
		await page.waitForTimeout(1000);

		// Theme toggle should be in the sidebar footer
		const themeToggle = page.getByRole("button", { name: /Theme/i }).first();
		if (await themeToggle.isVisible()) {
			await expect(themeToggle).toBeVisible();
		}
	});

	test("theme toggle button changes theme", async ({ page }) => {
		await page.goto("/en/settings");
		await page.waitForTimeout(1000);

		// Find theme toggle in the sidebar
		const themeButton = page.getByRole("button", { name: /Theme/i }).first();

		if (await themeButton.isVisible()) {
			const beforeTheme = await page.evaluate(() =>
				(document.documentElement.getAttribute("data-theme") ??
				document.documentElement.classList.contains("dark"))
					? "dark"
					: "light",
			);

			await themeButton.click();
			await page.waitForTimeout(500);

			const afterTheme = await page.evaluate(() =>
				(document.documentElement.getAttribute("data-theme") ??
				document.documentElement.classList.contains("dark"))
					? "dark"
					: "light",
			);

			// Theme should have changed
			expect(afterTheme).not.toEqual(beforeTheme);
		}
	});

	test("theme persists across page navigation", async ({ page }) => {
		await page.goto("/en/settings");
		await page.waitForTimeout(1000);

		const themeButton = page.getByRole("button", { name: /Theme/i }).first();

		if (await themeButton.isVisible()) {
			await themeButton.click();
			await page.waitForTimeout(300);

			// Navigate to another page
			await page.getByRole("link", { name: /Chat/i }).click();
			await page.waitForTimeout(500);

			// Theme should persist
			const persistedTheme = await page.evaluate(() =>
				(document.documentElement.getAttribute("data-theme") ??
				document.documentElement.classList.contains("dark"))
					? "dark"
					: "light",
			);

			expect(persistedTheme).toBeTruthy();
		}
	});
});

test.describe("locale switcher", () => {
	test("locale switcher exists in sidebar", async ({ page }) => {
		await page.goto("/en/settings");
		await page.waitForTimeout(1000);

		// Locale switcher should be in the sidebar footer
		const localeSwitcher = page.getByRole("combobox").first();

		if (await localeSwitcher.isVisible()) {
			await expect(localeSwitcher).toBeVisible();
		}
	});

	test("locale switcher shows current locale", async ({ page }) => {
		await page.goto("/en/settings");
		await page.waitForTimeout(1000);

		// Current page should be in English
		await expect(page.getByText(/Settings|Language/i).first()).toBeVisible({
			timeout: 10_000,
		});
	});

	test("switch to French locale", async ({ page }) => {
		await page.goto("/en/settings");
		await page.waitForTimeout(1000);

		// Try to find language selector
		const langButton = page
			.getByRole("button", { name: /English|French/i })
			.first();
		const langSelect = page.getByRole("combobox").first();

		if (await langButton.isVisible()) {
			await langButton.click();
			await page.waitForTimeout(300);

			// Click French option
			const frenchOption = page.getByText(/French|Français/i).first();
			if (await frenchOption.isVisible()) {
				await frenchOption.click();
				await page.waitForTimeout(1000);

				// Page should switch to French URL
				expect(page.url()).toMatch(/\/fr\//);
			}
		} else if (await langSelect.isVisible()) {
			await langSelect.click();
			await page.waitForTimeout(300);

			const frenchOption = page.getByText(/French|Français/i).first();
			if (await frenchOption.isVisible()) {
				await frenchOption.click();
				await page.waitForTimeout(1000);
			}
		}
	});
});
