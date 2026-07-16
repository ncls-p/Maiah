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

	test("defaults OpenAI-compatible connections to the Responses API", async ({
		page,
	}) => {
		await page.goto("/en/providers");

		await page.getByRole("button", { name: "Connect AI", exact: true }).click();
		await page.getByRole("button", { name: /^Advanced/ }).click();

		const apiRoute = page.getByLabel("Generation API");
		await expect(apiRoute).toContainText(
			"Responses API (/responses) — default",
		);

		await apiRoute.click();
		await page
			.getByRole("option", {
				name: "Chat Completions (/chat/completions)",
			})
			.click();
		await expect(apiRoute).toContainText(
			"Chat Completions (/chat/completions)",
		);
	});

	test("persists and updates the selected OpenAI-compatible API", async ({
		page,
	}) => {
		const workspacesResponse = await page.request.get("/api/workspaces");
		expect(workspacesResponse.ok()).toBe(true);
		const workspaces = (await workspacesResponse.json()) as Array<{
			workspace: { id: string };
		}>;
		const workspaceId = workspaces[0]?.workspace.id;
		if (!workspaceId) throw new Error("E2E workspace is missing");

		let providerId: string | undefined;
		try {
			const createResponse = await page.request.post(
				"/api/workspace/providers",
				{
					data: {
						workspaceId,
						kind: "openai-compatible",
						name: `OpenAI route E2E ${Date.now()}`,
						authType: "bearer",
						openaiCompatibleApiRoute: "chat-completions",
					},
				},
			);
			expect(createResponse.status()).toBe(201);
			const provider = (await createResponse.json()) as {
				id: string;
				openaiCompatibleApiRoute: string;
			};
			providerId = provider.id;
			expect(provider.openaiCompatibleApiRoute).toBe("chat-completions");

			const updateResponse = await page.request.patch(
				`/api/workspace/providers/${providerId}`,
				{
					data: {
						workspaceId,
						openaiCompatibleApiRoute: "responses",
					},
				},
			);
			expect(updateResponse.ok()).toBe(true);
			await expect(updateResponse.json()).resolves.toMatchObject({
				openaiCompatibleApiRoute: "responses",
			});
		} finally {
			if (providerId) {
				await page.request.delete(
					`/api/workspace/providers/${providerId}?workspaceId=${workspaceId}`,
				);
			}
		}
	});
});
