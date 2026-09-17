import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { ensureE2EAssistant, login } from "./fixtures";

nextEnv.loadEnvConfig(process.cwd());

test("keeps access navigation and direct links usable on desktop and mobile", async ({
  page,
}) => {
  const { workspaceId } = await ensureE2EAssistant();
  await login(page);
  expect(
    (
      await page.request.patch("/api/workspaces", { data: { workspaceId } })
    ).ok(),
  ).toBe(true);
  await page.goto("/en/members");
  const accessNav = page.getByRole("navigation", { name: "Access sections" });
  for (const name of ["People", "Teams", "Roles", "Resources"]) {
    await expect(
      accessNav.getByRole("tab", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(page).toHaveURL(/\/en\/members$/);
  await expect(
    page.getByRole("combobox", { name: "Active project", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Project and organization settings",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "Teams", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/members\/teams$/);
  await page.reload();
  await expect(page).toHaveURL(/\/en\/members\/teams$/);
  await expect(
    page.getByRole("button", { name: "Create team", exact: true }),
  ).toBeVisible();
  await page.goto("/en/admin/settings");
  const settings = page.getByRole("button", {
    name: "Project and organization settings",
    exact: true,
  });
  await settings.click();
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Transfer project", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Transfer project", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Transfer project", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const name = page.locator("#standalone-organization-name");
  await name.fill("Draft organization");
  await page.getByRole("tab", { name: "Platform", exact: true }).click();
  await expect(name).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add usage limit", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/admin\/settings$/);
  await expect(name).toBeVisible();
  await page.screenshot({
    path: "/tmp/maiah-access-navigation-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/members");
  await expect(
    accessNav.getByRole("tab", { name: "Resources", exact: true }),
  ).toBeVisible();
  await page.goto("/en/admin/settings?tab=platform");
  await expect(
    page.getByRole("combobox", { name: "Source project", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.goto("/en/members?tab=teams");
  await expect(page).toHaveURL(/\/en\/members\/teams$/);
  await page.goto("/en/members?section=organizations");
  await expect(page).toHaveURL(/\/en\/admin\/settings$/);
  await page.screenshot({
    path: "/tmp/maiah-access-navigation-mobile.png",
    fullPage: true,
  });
});
