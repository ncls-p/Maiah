import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});
test.beforeEach(async ({ page }) => {
  await login(page);
});

test("settings links preserve the selected organization", async ({ page }) => {
  const response = await page.request.get("/api/organizations");
  expect(response.ok()).toBe(true);
  const { organizations } = await response.json();
  const id = organizations[0].id;
  await page.goto(`/en/admin/settings/branding?organizationId=${id}`);
  const navigation = page.getByRole("navigation", {
    name: "Settings sections",
  });
  await navigation
    .getByRole("link", { name: "Connections", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/connections\\?organizationId=${id}`),
  );
  await expect(
    navigation.getByRole("link", { name: "Connections", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Microsoft Entra ID sign-in" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Genesys Cloud connection" }),
  ).toBeVisible();
});

test("an unavailable organization never displays another organization's form", async ({
  page,
}) => {
  await page.goto(
    "/en/admin/connections?organizationId=00000000-0000-4000-8000-000000000000",
  );
  await expect(
    page.getByText(
      "This organization is unavailable or inaccessible. Choose an available organization.",
    ),
  ).toBeVisible();
  await expect(page.locator("#microsoft-clientId")).toHaveCount(0);
  await expect(page.locator("#genesys-clientId")).toHaveCount(0);
});

test("mobile settings use a compact section selector", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/admin/settings/branding");
  await page
    .getByRole("combobox", { name: "Settings sections", exact: true })
    .selectOption("/admin/connections");
  await expect(page).toHaveURL(/\/en\/admin\/connections$/);
  await expect(
    page.getByRole("heading", { name: "Connections", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
