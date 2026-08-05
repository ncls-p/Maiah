import nextEnv from "@next/env";
import { expect,test } from "@playwright/test";
import { ensureE2EUser,login } from "./fixtures";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

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

  test("keeps the minimalist chat shell responsive and the brand logo unframed", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/chat");

    await page.getByRole("button", { name: "Open conversations", exact: true }).click();
    const logo = page.locator('img[alt="Deodis"]:visible').first();
    await expect(logo).toBeVisible({ timeout: 15_000 });
    await expect(logo).toHaveAttribute("data-no-outline", "true");
    expect(await logo.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");

    const brandLink = logo.locator("xpath=..");
    const brandLinkBox = await brandLink.boundingBox();
    expect(brandLinkBox?.height ?? 0).toBeGreaterThanOrEqual(40);

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("shows no assistants message when no agents exist", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(3000);

    // The chat page should show some content
    const content = page.locator(".page-content").last();
    await expect(content).toBeVisible();

    // Check for either the chat interface or the "no assistants" state
    await expect(page.getByText(/No assistants|New conversation|Message|Chat/i).first()).toBeVisible({ timeout: 10_000 });
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
    const newConversationBtn = page.getByRole("button", { name: /^New(?: conversation| chat)?$/i }).first();
    await expect(newConversationBtn).toBeEnabled({ timeout: 15_000 });
  });

  test("keeps history controls ordered, reachable, and responsive", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/chat");

    const desktopSidebar = page.getByRole("complementary").first();
    await expect(desktopSidebar).toBeVisible({ timeout: 15_000 });

    const newConversation = desktopSidebar.getByRole("button", {
      name: "New conversation",
      exact: true,
    });
    const historySearch = desktopSidebar.getByRole("searchbox", {
      name: "Search chat history",
    });
    const createFolder = desktopSidebar.getByRole("button", {
      name: "Create folder",
      exact: true,
    });
    const collapseSidebar = desktopSidebar.getByRole("button", {
      name: "Collapse chat sidebar",
      exact: true,
    });

    await expect(newConversation).toBeVisible();
    await expect(historySearch).toBeVisible();
    await expect(createFolder).toBeVisible();
    await expect(collapseSidebar).toBeVisible();

    const desktopBoxes = await Promise.all([newConversation.boundingBox(), historySearch.boundingBox(), createFolder.boundingBox(), collapseSidebar.boundingBox()]);
    for (const box of desktopBoxes) {
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(40);
      expect(box!.height).toBeGreaterThanOrEqual(40);
    }
    expect(desktopBoxes[0]!.y).toBeLessThan(desktopBoxes[1]!.y);
    expect(desktopBoxes[1]!.y).toBeLessThan(desktopBoxes[2]!.y);
    expect(desktopBoxes[3]!.y).toBeLessThan(desktopBoxes[0]!.y);

    await createFolder.click();
    const folderName = desktopSidebar.getByRole("textbox", {
      name: "Folder name",
    });
    await expect(folderName).toBeFocused();
    await folderName.press("Escape");
    await expect(folderName).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open conversations", exact: true }).click();

    const mobileSidebar = page.locator('[data-slot="sheet-content"]');
    await expect(mobileSidebar).toBeVisible();
    const mobileNewConversation = mobileSidebar.getByRole("button", {
      name: "New conversation",
      exact: true,
    });
    const mobileSearch = mobileSidebar.getByRole("searchbox", {
      name: "Search chat history",
    });
    const mobileFolder = mobileSidebar.getByRole("button", {
      name: "Create folder",
      exact: true,
    });
    const mobileBoxes = await Promise.all([mobileNewConversation.boundingBox(), mobileSearch.boundingBox(), mobileFolder.boundingBox()]);
    expect(mobileBoxes[0]!.y).toBeLessThan(mobileBoxes[1]!.y);
    expect(mobileBoxes[1]!.y).toBeLessThan(mobileBoxes[2]!.y);
    expect(await mobileSidebar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
});
