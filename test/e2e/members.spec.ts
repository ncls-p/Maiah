import { expect, test } from "@playwright/test";
import {
  e2eMember,
  ensureE2ELifecycleProject,
  ensureE2EMember,
  ensureE2ETransferScenario,
  ensureE2EUser,
  login,
} from "./fixtures";

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

  test("shows each account only once across scoped access", async ({
    page,
  }) => {
    await ensureE2EMember();
    await page.goto("/en/members");

    await page
      .getByPlaceholder("Search people, email, role, or team…")
      .fill(e2eMember.email);
    const matchingRows = page.locator("tbody tr").filter({
      hasText: e2eMember.email,
    });
    await expect(matchingRows).toHaveCount(1);
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

  test("previews a customizable resource transfer in one dialog", async ({
    page,
  }) => {
    await ensureE2ETransferScenario();
    await page.goto("/en/members");
    const activeProject = page.getByRole("combobox", {
      name: "Active project",
    });
    if (!(await activeProject.textContent())?.includes("Maiah")) {
      await activeProject.click();
      await page.getByRole("option", { name: "Maiah", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Resources" }).click();

    const resourceRow = page.locator("tbody tr").filter({
      hasText: "Transfer preview assistant",
    });
    await expect(resourceRow).toBeVisible({ timeout: 10_000 });
    await resourceRow
      .getByRole("button", { name: "Transfer", exact: true })
      .click();

    const dialog = page.getByRole("dialog", {
      name: "Transfer Transfer preview assistant",
    });
    const destinationName = "Transfer destination";
    await dialog
      .getByPlaceholder("Search an organization or project…")
      .fill(destinationName);
    await dialog.getByRole("combobox").click();
    await page
      .getByRole("option", { name: new RegExp(`Deodis · ${destinationName}`) })
      .click();
    await dialog.getByRole("button", { name: "Advanced options" }).click();
    await expect(dialog.getByText("Secrets and connections")).toBeVisible();
    await dialog.getByRole("button", { name: "Review transfer" }).click();
    await expect(dialog.getByText(/resource ready/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      dialog.getByRole("button", { name: "Transfer now" }),
    ).toBeEnabled();
  });

  test("previews a complete project clone from the unified workflow", async ({
    page,
  }) => {
    await ensureE2ETransferScenario();
    await page.goto("/en/members");
    const activeProject = page.getByRole("combobox", {
      name: "Active project",
    });
    if (!(await activeProject.textContent())?.includes("Maiah")) {
      await activeProject.click();
      await page.getByRole("option", { name: "Maiah", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Resources" }).click();
    await page
      .getByRole("button", { name: "Move or clone everything" })
      .click();

    const dialog = page.getByRole("dialog", {
      name: "Move or clone a complete scope",
    });
    const selects = dialog.getByRole("combobox");
    await selects.nth(1).click();
    await page.getByRole("option", { name: "Clone", exact: true }).click();
    await dialog
      .getByPlaceholder("Type an organization or project name…")
      .fill("Transfer destination");
    await dialog.getByRole("button", { name: /Transfer destination/ }).click();
    await dialog.getByRole("button", { name: "Review transfer" }).click();
    await expect(
      dialog.getByRole("button", { name: "Clone everything" }),
    ).toBeEnabled({ timeout: 10_000 });
    await expect(dialog.getByText(/Scheduled tasks/).first()).toBeVisible();
  });

  test("simulates an organization transfer and resolves project URL conflicts", async ({
    page,
  }) => {
    await ensureE2ETransferScenario();
    await page.goto("/en/members");
    const activeProject = page.getByRole("combobox", {
      name: "Active project",
    });
    if (!(await activeProject.textContent())?.includes("Maiah")) {
      await activeProject.click();
      await page.getByRole("option", { name: "Maiah", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Resources" }).click();
    await page
      .getByRole("button", { name: "Move or clone everything" })
      .click();

    const dialog = page.getByRole("dialog", {
      name: "Move or clone a complete scope",
    });
    await dialog.getByRole("combobox").first().click();
    await page
      .getByRole("option", { name: "The complete organization" })
      .click();
    await dialog
      .getByPlaceholder("Type an organization or project name…")
      .fill("Transfer organization");
    await dialog.getByRole("button", { name: /Transfer organization/ }).click();
    await dialog.getByRole("button", { name: "Review transfer" }).click();

    await expect(
      dialog.getByText("Conflicts resolved automatically"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("main-2", { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Move everything" }),
    ).toBeEnabled();
  });

  test("renames and deletes a project from the unified manage menu", async ({
    page,
  }) => {
    await ensureE2ELifecycleProject();
    await page.goto("/en/members");
    const activeProject = page.getByRole("combobox", {
      name: "Active project",
    });
    await activeProject.click();
    await page
      .getByRole("option", { name: "Lifecycle browser project", exact: true })
      .click();

    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page.getByRole("menuitem", { name: "Rename project" }).click();
    const renameDialog = page.getByRole("dialog", { name: "Rename project" });
    await renameDialog
      .getByLabel("Project name")
      .fill("Lifecycle browser project renamed");
    await renameDialog.getByLabel("URL identifier").fill("e2e-lifecycle");
    await renameDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(renameDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(activeProject).toContainText(
      "Lifecycle browser project renamed",
    );

    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete project" }).click();
    const deleteDialog = page.getByRole("dialog", {
      name: "Permanently delete project",
    });
    await deleteDialog
      .getByLabel(/Type “Lifecycle browser project renamed” exactly/)
      .fill("Lifecycle browser project renamed");
    await deleteDialog
      .getByRole("button", { name: "Delete permanently" })
      .click();
    await expect(deleteDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(activeProject).not.toContainText(
      "Lifecycle browser project renamed",
    );
  });

  test("deletes any governed resource from the resource table", async ({
    page,
  }) => {
    await ensureE2ETransferScenario();
    await page.goto("/en/members");
    const activeProject = page.getByRole("combobox", {
      name: "Active project",
    });
    if (!(await activeProject.textContent())?.includes("Maiah")) {
      await activeProject.click();
      await page.getByRole("option", { name: "Maiah", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Resources" }).click();

    const resourceRow = page.locator("tbody tr").filter({
      hasText: "Removable assistant",
    });
    await expect(resourceRow).toBeVisible({ timeout: 10_000 });
    await resourceRow
      .getByRole("button", { name: "Delete Removable assistant" })
      .click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(
      deleteDialog.getByText("Delete Removable assistant?"),
    ).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete resource" }).click();
    await expect(resourceRow).not.toBeVisible({ timeout: 10_000 });
  });

  test("grants project access through an organization team", async ({
    page,
  }) => {
    const teamName = `E2E Access ${Date.now()}`;
    await ensureE2EMember();
    await page.goto("/en/members");

    await page.getByRole("button", { name: "Add person" }).click();
    const personDialog = page.getByRole("dialog", { name: "Add a person" });
    await personDialog.getByLabel("Email").fill(e2eMember.email);
    await personDialog
      .getByRole("button", { name: "Add to organization" })
      .click();
    await expect(personDialog).not.toBeVisible();

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
