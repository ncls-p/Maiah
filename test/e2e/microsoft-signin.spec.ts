import { expect, test } from "@playwright/test";

test("Microsoft asks for email only after clicking its button", async ({
  page,
}) => {
  await page.goto("/en/auth/signin");
  await expect(page.locator("#microsoft-email")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Sign in with Microsoft", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const email = dialog.locator("#microsoft-email");
  await expect(email).toBeFocused();
  await email.fill("employee@example.test");
  await page.route("**/api/auth/microsoft/providers", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      email: "employee@example.test",
    });
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "No configured organization" }),
    });
  });
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(email).toHaveValue("employee@example.test");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Sign in$/i })).toBeVisible();
});
