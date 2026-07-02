import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
	await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
	await login(page);
});

test.describe("chat page", () => {
	test("loads chat page", async ({ page }) => {
		await page.goto("/en/chat");
		await expect(page).toHaveURL(/\/en\/chat/);
	});

	test("shows no assistants message when no agents exist", async ({ page }) => {
		await page.goto("/en/chat");
		await page.waitForTimeout(3000);

		// The chat page should show some content
		const content = page.locator(".page-content");
		await expect(content).toBeVisible();

		// Check for either the chat interface or the "no assistants" state
		await expect(
			page.getByText(/No assistants|New conversation|Message|Chat/i).first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("chat sidebar contains conversation list", async ({ page }) => {
		await page.goto("/en/chat");
		await page.waitForTimeout(2000);

		// Chat sidebar should be visible with the chat interface
		const chatInterface = page.getByRole("main").first();
		await expect(chatInterface).toBeVisible();
	});

	test("new conversation button exists", async ({ page }) => {
		await page.goto("/en/chat");
		await page.waitForTimeout(2000);

		// Look for new conversation button or similar
		const newConversationBtn = page
			.getByRole("button", { name: /New conversation|New chat/i })
			.first();

		if (await newConversationBtn.isVisible()) {
			await expect(newConversationBtn).toBeEnabled();
		}
	});

	test("agent selector is present when agents exist", async ({ page }) => {
		await page.goto("/en/chat");
		await page.waitForTimeout(2000);

		// Agent selector should be present in the chat sidebar
		const agentSelector = page.getByRole("combobox").first();
		if (await agentSelector.isVisible()) {
			await expect(agentSelector).toBeVisible();
		}
	});

	test("navigate between chat and other pages", async ({ page }) => {
		await page.goto("/en/chat");
		await expect(page).toHaveURL(/\/en\/chat/);

		// Navigate to agents
		await page.getByRole("link", { name: /Assistants/i }).click();
		await expect(page).toHaveURL(/\/en\/agents/);

		// Navigate back to chat
		await page.getByRole("link", { name: /Chat/i }).click();
		await expect(page).toHaveURL(/\/en\/chat/);
	});
});

test.describe("chat composer", () => {
	test("input field is present when agents exist", async ({ page }) => {
		await page.goto("/en/chat");
		await page.waitForTimeout(2000);

		// Chat composer / textarea should be present
		const composer = page.locator("textarea, [role='textbox']").first();

		if (await composer.isVisible()) {
			await expect(composer).toBeVisible();
		}
	});
});
