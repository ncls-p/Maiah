import { expect, test } from "@playwright/test";
import { e2eMember, ensureE2EMember, ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("members page", () => {
  test("loads members page", async ({ page }) => {
    await page.goto("/en/members");
    await expect(page).toHaveURL(/\/en\/members/);

    await expect(
      page.getByRole("heading", { name: /Access/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows one unified access table", async ({ page }) => {
    await page.goto("/en/members");
    await expect(page.getByText("Who has access")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByPlaceholder("Search people, email, role, or team…"),
    ).toBeVisible();
  });

  test("shows the organization to project inheritance path", async ({
    page,
  }) => {
    await page.goto("/en/members");

    await expect(
      page.getByText(/Organization roles apply to every project/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("offers scoped role assignment", async ({ page }) => {
    await page.goto("/en/members");
    await expect(page.getByRole("button", { name: "Assign role" })).toBeEnabled(
      { timeout: 10_000 },
    );
  });

  test("shows people, teams, and roles tabs", async ({ page }) => {
    await page.goto("/en/members");
    await expect(
      page.getByRole("tab", { name: "People & access" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Teams" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Roles" })).toBeVisible();
  });

  test("shows each account once with all of its access", async ({ page }) => {
    await ensureE2EMember();
    await page.goto("/en/members");

    await page
      .getByPlaceholder("Search people, email, role, or team…")
      .fill(e2eMember.email);
    const matchingRows = page.locator("tbody tr").filter({
      hasText: e2eMember.email,
    });
    await expect(matchingRows).toHaveCount(1);
    await expect(matchingRows).toContainText("Organization Member");
  });

  test("opens built-in roles with their permission matrix", async ({
    page,
  }) => {
    await page.goto("/en/members");
    await page.getByRole("tab", { name: "Roles" }).click();

    const roleRow = page.locator("tbody tr").filter({
      hasText: "Project Viewer",
    });
    await roleRow.getByRole("button", { name: /permissions/i }).click();
    const roleDialog = page.getByRole("dialog", {
      name: /Project Viewer permissions/,
    });
    await expect(roleDialog.getByLabel("Role name")).toBeDisabled();
    await expect(roleDialog.getByRole("checkbox").first()).toBeDisabled();
    await expect(
      roleDialog.getByRole("button", { name: "Duplicate and customize" }),
    ).toBeVisible();
  });

  test("grants project access through an organization team", async ({
    page,
  }) => {
    const teamName = `E2E Access ${Date.now()}`;
    await ensureE2EMember();
    await page.goto("/en/members");

    await page.getByRole("tab", { name: "Teams" }).click();
    await page.getByRole("button", { name: "Create team" }).click();
    const teamDialog = page.getByRole("dialog", { name: "Create a team" });
    await teamDialog.getByLabel("Team name").fill(teamName);
    await teamDialog.getByLabel("Description").fill("Browser access flow");
    await teamDialog.getByRole("button", { name: "Create team" }).click();
    await expect(teamDialog).not.toBeVisible();

    const teamCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: teamName });
    await teamCard.getByRole("combobox").click();
    await page.getByRole("option", { name: e2eMember.name }).click();
    await teamCard.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      teamCard
        .locator('[data-slot="badge"]')
        .filter({ hasText: e2eMember.name }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "People & access" }).click();
    await page.getByRole("button", { name: "Assign role" }).click();
    const accessDialog = page.getByRole("dialog", { name: "Grant access" });
    const accessSelects = accessDialog.getByRole("combobox");
    await accessSelects.nth(1).click();
    await page.getByRole("option", { name: "Team", exact: true }).click();
    await accessSelects.nth(2).click();
    await page.getByRole("option", { name: teamName, exact: true }).click();
    await accessSelects.nth(3).click();
    await page.getByRole("option", { name: "Project Viewer" }).click();
    await accessDialog.getByRole("button", { name: "Grant access" }).click();
    await expect(accessDialog).not.toBeVisible();
    await page
      .getByPlaceholder("Search people, email, role, or team…")
      .fill(teamName);
    await expect(
      page.locator("tbody tr").filter({ hasText: e2eMember.email }),
    ).toHaveCount(1);
  });
});
