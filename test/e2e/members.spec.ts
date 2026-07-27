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

  test("shows organization access assignments", async ({ page }) => {
    await page.goto("/en/members");
    await expect(page.getByText("Who has access")).toBeVisible({
      timeout: 10_000,
    });
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

  test("shows members, teams, and roles tabs", async ({ page }) => {
    await page.goto("/en/members");
    await expect(page.getByRole("tab", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Teams" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Roles" })).toBeVisible();
  });

  test("grants project access through an organization team", async ({
    page,
  }) => {
    const teamName = `E2E Access ${Date.now()}`;
    await ensureE2EMember();
    await page.goto("/en/members");

    await page.getByRole("tab", { name: "Members" }).click();
    await page.getByRole("button", { name: "Add member" }).click();
    const memberDialog = page.getByRole("dialog", {
      name: "Add an organization member",
    });
    await memberDialog.getByLabel("Email").fill(e2eMember.email);
    await memberDialog.getByRole("button", { name: "Add member" }).click();
    await expect(memberDialog).not.toBeVisible();
    await expect(page.getByText(e2eMember.email)).toBeVisible();

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

    await page.getByRole("tab", { name: "Assignments" }).click();
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
    await expect(
      page
        .locator('[data-slot="card"]')
        .filter({ hasText: "Who has access" })
        .getByText(teamName),
    ).toBeVisible();
  });
});
