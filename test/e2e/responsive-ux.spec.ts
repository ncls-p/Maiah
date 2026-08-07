import { expect,test,type Page } from "@playwright/test";
import { ensureE2EAssistant,ensureE2EUser,login } from "./fixtures";

const workspaceRoutes = ["/en/chat", "/en/agents", "/en/knowledge", "/en/scheduled-tasks", "/en/tools", "/en/providers", "/en/marketplace", "/en/workflows", "/en/api-keys", "/en/members", "/en/usage", "/en/audit", "/en/settings", "/en/admin/settings", "/en/setup"] as const;

let responsiveAgentId = "";

const dialogTriggers = ["Create assistant", "New collection", "Connect AI", "Create task", "Create workflow", "Create API key"] as const;

async function expectUsableViewport(page: Page, route: string) {
  await page.goto(route);
  await expect(page.locator("#workspace-main")).toBeVisible({
    timeout: 15_000,
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), { message: `${route} must not overflow horizontally` }).toBe(true);

  const accessibility = await page.evaluate(() => {
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const unnamedButtons = [...document.querySelectorAll("button")]
      .filter(isVisible)
      .filter((field) => field.getAttribute("aria-hidden") !== "true" && !field.closest('[aria-hidden="true"]'))
      .filter((button) => !button.textContent?.trim() && !button.getAttribute("aria-label") && !button.getAttribute("aria-labelledby") && !button.getAttribute("title") && !button.closest("label") && !(button.id && document.querySelector(`label[for="${CSS.escape(button.id)}"]`)))
      .map((button) => ({
        slot: button.getAttribute("data-slot"),
        className: button.className,
        html: button.outerHTML.slice(0, 240),
      }));
    const unlabeledFields = [...document.querySelectorAll("input:not([type=hidden]), textarea, select")]
      .filter(isVisible)
      .filter((field) => field.getAttribute("aria-hidden") !== "true" && !field.closest('[aria-hidden="true"]'))
      .filter((field) => {
        if (field.getAttribute("aria-label") || field.getAttribute("aria-labelledby")) return false;
        if (field instanceof HTMLInputElement && field.labels?.length) return false;
        if (field instanceof HTMLTextAreaElement && field.labels?.length) return false;
        if (field instanceof HTMLSelectElement && field.labels?.length) return false;
        return true;
      })
      .map((field) => ({
        slot: field.getAttribute("data-slot"),
        html: field.outerHTML.slice(0, 240),
      }));
    return { unnamedButtons, unlabeledFields };
  });

  expect(accessibility.unnamedButtons, `${route}: unnamed buttons`).toEqual([]);
  expect(accessibility.unlabeledFields, `${route}: unlabeled fields`).toEqual([]);
}

test.beforeAll(async () => {
  await ensureE2EUser();
  ({ agentId: responsiveAgentId } = await ensureE2EAssistant());
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("every workspace screen remains usable on desktop and mobile", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of workspaceRoutes) {
      await expectUsableViewport(page, route);
    }
  }
});

test("mobile workspace uses an app navigation instead of the desktop shell", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/en/tools");

  const navigation = page.locator('[data-slot="mobile-app-navigation"]');
  await expect(navigation).toBeVisible({ timeout: 15_000 });
  await expect(navigation.getByRole("link")).toHaveCount(5);
  await expect(page.locator('[data-slot="workspace-history-sidebar"]')).toBeHidden();

  const bounds = await navigation.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(412);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(915);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);

  await expect
    .poll(() => page.locator(".workspace-route-content").evaluate((element) => getComputedStyle(element).animationName))
    .toBe("none");
  await page.locator(".workspace-route-content").evaluate((element) => {
    element.setAttribute("data-stability-probe", "preserved");
  });
  await navigation.getByRole("link", { name: "Assistants" }).click();
  await expect(page).toHaveURL(/\/en\/agents$/);
  await expect(page.locator('.workspace-route-content[data-stability-probe="preserved"]')).toHaveCount(1);
});

test("secondary and legacy routes remain usable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expectUsableViewport(page, `/en/agents/${responsiveAgentId}`);

  await page.goto("/en/mcp");
  await expect(page).toHaveURL(/\/en\/tools\?tab=mcp/);
  await expectUsableViewport(page, page.url());

  await page.goto("/en/custom-tools");
  await expect(page).toHaveURL(/\/en\/workflows/);
  await expectUsableViewport(page, page.url());
});

test("public forms and API documentation fit a narrow viewport", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  for (const route of ["/en/auth/signin", "/en/auth/signup", "/api/docs"]) {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }

  await context.close();
});

test("available creation dialogs fit a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of workspaceRoutes) {
    await page.goto(route);
    await expect(page.locator("#workspace-main")).toBeVisible({
      timeout: 15_000,
    });

    for (const triggerName of dialogTriggers) {
      const trigger = page.getByRole("button", {
        name: triggerName,
        exact: true,
      });
      if ((await trigger.count()) !== 1 || !(await trigger.isVisible())) continue;

      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds, `${route}: ${triggerName} dialog has bounds`).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
      await expect
        .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), {
          message: `${route}: ${triggerName} content must not overflow`,
        })
        .toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      break;
    }
  }
});

test("advanced knowledge settings reflow inside the creation dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/knowledge");
  await page.getByRole("button", { name: /New collection|Create a collection/ }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Advanced RAG pipeline/ }).click();
  await dialog.getByLabel("Customize this collection").click();
  await expect(dialog.getByLabel("Passage length")).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
