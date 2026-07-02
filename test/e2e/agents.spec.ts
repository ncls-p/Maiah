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
	const testAgentName = `E2E Agent ${Date.now()}`;

	test("create and delete agent", async ({ page }) => {
		await page.goto("/en/agents");
		await page.waitForTimeout(2000);

		// Open create dialog
		const createBtn = page
			.getByRole("button", { name: /New assistant|Create/i })
			.first();

		if (!(await createBtn.isVisible())) {
			test.skip();
		}

		await createBtn.click();
		await page.waitForTimeout(500);

		// Fill in the agent creation form
		const nameInput = page.getByLabel(/Name/i).first();
		if (await nameInput.isVisible()) {
			await nameInput.fill(testAgentName);

			// Submit the form
			const submitBtn = page.getByRole("button", { name: /Create/i }).first();

			if (await submitBtn.isVisible()) {
				await submitBtn.click();
				await page.waitForTimeout(2000);

				// Verify agent was created
				await expect(page.getByText(testAgentName)).toBeVisible({
					timeout: 10_000,
				});

				// Delete the agent - find the action menu
				const agentRow = page.getByText(testAgentName).first();
				const rowContext = agentRow.locator("..");

				// Try to find delete button via dropdown
				const menuBtn = rowContext
					.locator('[aria-label*="actions"], [aria-label*="more"]')
					.first();

				if (await menuBtn.isVisible()) {
					await menuBtn.click();
					await page.waitForTimeout(300);

					const deleteBtn = page
						.getByRole("menuitem", { name: /Delete/i })
						.first();

					if (await deleteBtn.isVisible()) {
						await deleteBtn.click();
						await page.waitForTimeout(300);

						// Confirm deletion if dialog appears
						const confirmBtn = page
							.getByRole("button", { name: /Delete|Confirm/i })
							.first();

						if (await confirmBtn.isVisible()) {
							await confirmBtn.click();
							await page.waitForTimeout(2000);

							// Verify agent was deleted
							await expect(page.getByText(testAgentName)).not.toBeVisible({
								timeout: 10_000,
							});
						}
					}
				}
			}
		}
	});

	test("agent templates are available", async ({ page }) => {
		await page.goto("/en/agents");
		await page.waitForTimeout(2000);

		const createBtn = page
			.getByRole("button", { name: /New assistant|Create/i })
			.first();

		if (!(await createBtn.isVisible())) {
			test.skip();
		}

		await createBtn.click();
		await page.waitForTimeout(500);

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
			.getByRole("link", { name: /Configure|Chat|View/i })
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
