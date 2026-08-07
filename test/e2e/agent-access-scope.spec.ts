import { expect, test } from "@playwright/test";

import { createAssistantButtonName } from "./agents.spec.create-assistant-button-name";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("offers permission-aware assistant access scopes without mobile overflow", async ({
  page,
}) => {
  await page.goto("/en/agents");
  await page
    .getByRole("button", { name: createAssistantButtonName })
    .first()
    .click();

  const picker = page.locator('[data-slot="agent-access-scope-picker"]');
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: /^Only me/i })).toBeVisible();
  await expect(
    picker.getByRole("button", { name: /^This project/i }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", { name: /^Organization/i }),
  ).toBeVisible();
  await expect(picker.getByRole("button", { name: /^A team/i })).toBeVisible();

  await picker.getByRole("button", { name: /^A team/i }).click();
  const teamSelect = picker.getByRole("combobox", { name: /^Team$/i });
  await expect(teamSelect).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(picker).toBeVisible();
  expect(
    await picker.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
});
