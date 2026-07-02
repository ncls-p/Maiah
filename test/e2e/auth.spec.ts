import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
	await ensureE2EUser();
});

test.describe("authentication", () => {
	test.describe("sign in page", () => {
		test("loads sign in page with correct structure", async ({ page }) => {
			await page.goto("/en/auth/signin");
			await expect(page).toHaveTitle(/Sign in to AI Hub|AI Hub|App/i);

			// Logo should be visible
			await expect(page.getByRole("img").first()).toBeVisible();

			// Email and password fields
			await expect(page.getByLabel("Email")).toBeVisible();
			await expect(page.getByLabel("Password")).toBeVisible();

			// Sign in button
			await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

			// Sign up link
			await expect(page.getByText("Sign up")).toBeVisible();
		});

		test("sign in with valid credentials redirects to workspace", async ({
			page,
		}) => {
			await login(page);
			await expect(page).toHaveURL(/\/en\/(chat|setup)/);
		});

		test("sign in with invalid credentials shows error", async ({ page }) => {
			await page.goto("/en/auth/signin");
			await page.getByLabel("Email").fill("wrong@example.test");
			await page.getByLabel("Password").fill("WrongPassword!");
			await page.getByRole("button", { name: "Sign in" }).click();

			await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
		});

		test("sign in with empty fields shows validation error", async ({
			page,
		}) => {
			await page.goto("/en/auth/signin");
			await page.getByRole("button", { name: "Sign in" }).click();

			// HTML5 required validation should prevent submission
			await expect(page).toHaveURL(/signin/);
		});
	});

	test.describe("sign up page", () => {
		test("loads sign up page with correct structure", async ({ page }) => {
			await page.goto("/en/auth/signup");

			// Name, email and password fields
			await expect(page.getByLabel("Full name")).toBeVisible();
			await expect(page.getByLabel("Email")).toBeVisible();
			await expect(page.getByLabel("Password")).toBeVisible();

			// Create account button or registration closed message
			await expect(
				page.locator(
					'[role="button"]:has-text("Create account"), [role="button"]:has-text("Sign in")',
				),
			).toBeVisible();

			// Sign in link
			await expect(page.getByText("Sign in")).toBeVisible();
		});

		test("sign up form requires all fields", async ({ page }) => {
			await page.goto("/en/auth/signup");

			// Try to submit empty form — HTML5 required should prevent it
			const createButton = page.getByRole("button", { name: "Create account" });
			if (await createButton.isVisible()) {
				await createButton.click();
				// Should stay on the same page
				await expect(page).toHaveURL(/signup/);
			}
		});
	});

	test.describe("sign out flow", () => {
		test.beforeEach(async ({ page }) => {
			await login(page);
		});

		test("sign out button exists in sidebar", async ({ page }) => {
			// Wait for the workspace shell to load
			await page.waitForTimeout(1000);

			// Sign out should be accessible via the sidebar footer
			await expect(
				page
					.getByRole("button")
					.filter({ hasText: /Sign out/i })
					.first(),
			).toBeVisible({ timeout: 10_000 });
		});
	});

	test.describe("auth redirects", () => {
		test("unauthenticated users are redirected to sign in", async ({
			page,
		}) => {
			// Clear cookies to ensure unauthenticated state
			await page.context().clearCookies();
			await page.goto("/en/chat");
			// Should redirect to sign in
			await expect(page).toHaveURL(/signin/, { timeout: 15_000 });
		});
	});
});
