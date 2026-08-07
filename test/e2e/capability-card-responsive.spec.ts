import { expect, test } from "@playwright/test";
import { ensureE2EAssistant, ensureE2EUser, login } from "./fixtures";

let responsiveAgentId = "";

test.beforeAll(async () => {
  await ensureE2EUser();
  ({ agentId: responsiveAgentId } = await ensureE2EAssistant());
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("built-in tool packages keep readable copy beside their controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/en/agents/${responsiveAgentId}`);
  await page.getByRole("tab", { name: "Capabilities" }).click();

  const card = page.locator('[data-slot="builtin-tool-package-card"]').first();
  await expect(card).toBeVisible();
  const description = card.locator("p.text-muted-foreground").first();
  const bounds = await description.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThan(200);
  await expect
    .poll(() =>
      card.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    )
    .toBe(true);
});
