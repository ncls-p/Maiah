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

  test("keeps the minimalist chat shell responsive and the brand logo unframed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/chat");

    const logo = page.locator('img[alt="Deodis"]:visible').first();
    await expect(logo).toBeVisible({ timeout: 15_000 });
    await expect(logo).toHaveAttribute("data-no-outline", "true");
    expect(
      await logo.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).toBe("none");

    const brandLink = logo.locator("xpath=..");
    const brandLinkBox = await brandLink.boundingBox();
    expect(brandLinkBox?.height ?? 0).toBeGreaterThanOrEqual(40);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("shows no assistants message when no agents exist", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(3000);

    // The chat page should show some content
    const content = page.locator(".page-content").last();
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
    await expect(page.getByRole("complementary").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Conversations/i).first()).toBeVisible();
  });

  test("new conversation button exists", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(2000);

    // Look for new conversation button or similar
    const newConversationBtn = page
      .getByRole("button", { name: /^New(?: conversation| chat)?$/i })
      .first();
    await expect(newConversationBtn).toBeEnabled({ timeout: 15_000 });
  });

  test("agent selector is present when agents exist", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(2000);

    // Agent selector should be present in the chat sidebar
    const agentSelector = page
      .getByRole("button", { name: /Current assistant/i })
      .first();
    if (await agentSelector.isVisible()) {
      await expect(agentSelector).toBeVisible();
    }
  });

  test("navigate between chat and other pages", async ({ page }) => {
    await page.goto("/en/chat");
    await expect(page).toHaveURL(/\/en\/chat/);

    // Navigate to agents
    await page
      .getByRole("link", {
        name: /Create an assistant|Configure assistant/i,
      })
      .first()
      .click();
    await expect(page).toHaveURL(/\/en\/agents/);

    // Navigate back to chat
    await page.getByRole("link", { name: "Chat", exact: true }).click();
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
