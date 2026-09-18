import { expect, test } from "@playwright/test";
import { openPersonGrantAccess } from "./access-ui";
import {
  e2eAccessManager,
  e2eMember,
  e2eOrganizationAdmin,
  ensureE2EAccessManager,
  ensureE2EMember,
  ensureE2EOrganizationAdmin,
  ensureE2EUser,
  login,
  loginWithCredentials,
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
    await expect(
      page.getByRole("columnheader", { name: "Person", exact: true }),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("#people-search")).toBeVisible();
  });

  test("explains organization inheritance in project settings", async ({
    page,
  }) => {
    await page.goto("/en/admin/settings");

    await page
      .getByText("Project and organization settings", { exact: true })
      .click();
    await expect(
      page.getByText(/Organization roles apply to every project/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("offers scoped role assignment", async ({ page }) => {
    await page.goto("/en/members");
    await expect(
      page.getByRole("columnheader", {
        name: "Role in this project",
        exact: true,
      }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Invite" })).toBeEnabled();
  });

  test("shows people, teams, and roles links", async ({ page }) => {
    await page.goto("/en/members");
    await expect(
      page.getByRole("link", { name: "People", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Teams" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Roles" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Resources", exact: true }),
    ).toBeVisible();
  });

  test("assigns a project role from the people table", async ({ page }) => {
    await ensureE2EMember();
    await page.goto("/en/members");

    await page.locator("#people-search").fill(e2eMember.email);
    const person = page
      .locator("tbody tr")
      .filter({ hasText: e2eMember.email });
    await person.getByRole("button", { name: /^Role for / }).click();
    await page.getByRole("menuitemradio", { name: /^Viewer/ }).click();
    await expect(
      person.getByRole("button", { name: /^Role for / }),
    ).toContainText("Viewer");
  });

  test("limits a project access manager to roles they can delegate", async ({
    page,
  }) => {
    await ensureE2EAccessManager();
    await page.context().clearCookies();
    await loginWithCredentials(page, e2eAccessManager);
    await page.goto("/en/members");

    await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);

    const workspacesResponse = await page.request.get("/api/workspaces");
    const workspaceRows = (await workspacesResponse.json()) as Array<{
      workspace: { id: string; slug: string };
    }>;
    const workspaceId = workspaceRows.find(
      ({ workspace }) => workspace.slug === "main",
    )?.workspace.id;
    expect(workspaceId).toBeTruthy();
    const snapshotResponse = await page.request.get(
      `/api/workspace/iam?workspaceId=${workspaceId}`,
    );
    const accessSnapshot = (await snapshotResponse.json()) as {
      members: Array<{ userId: string; email: string }>;
      roles: Array<{ id: string; name: string; displayName: string }>;
      assignableRoleIds: string[];
    };
    const actorId = accessSnapshot.members.find(
      ({ email }) => email === e2eAccessManager.email,
    )?.userId;
    const administratorRoleId = accessSnapshot.roles.find(
      ({ name }) => name === "workspace.admin",
    )?.id;
    expect(actorId).toBeTruthy();
    expect(administratorRoleId).toBeTruthy();
    const assignable = accessSnapshot.roles.filter((role) =>
      accessSnapshot.assignableRoleIds.includes(role.id),
    );
    expect(
      assignable.some(
        (role) => role.displayName === "Restricted Access Manager",
      ),
    ).toBe(true);
    expect(
      assignable.some(
        (role) =>
          role.displayName === "Project Administrator" ||
          role.name === "workspace.admin",
      ),
    ).toBe(false);
    expect(
      assignable.some(
        (role) =>
          role.displayName === "Project Viewer" ||
          role.name === "workspace.viewer",
      ),
    ).toBe(false);
    const escalationResponse = await page.request.post("/api/workspace/iam", {
      data: {
        action: "assignRole",
        workspaceId,
        principalType: "user",
        principalId: actorId,
        roleId: administratorRoleId,
        scopeType: "workspace",
      },
    });
    expect(escalationResponse.status()).toBe(403);

    await page.getByRole("link", { name: "Teams" }).click();
    await expect(page.getByRole("button", { name: "Create team" })).toHaveCount(
      0,
    );
  });

  test("prevents an organization administrator from granting ownership", async ({
    page,
  }) => {
    await ensureE2EOrganizationAdmin();
    await ensureE2EMember();
    await page.context().clearCookies();
    await loginWithCredentials(page, e2eOrganizationAdmin);
    await page.goto("/en/members");

    const dialog = await openPersonGrantAccess(page, e2eMember.name);
    await dialog.getByText("Advanced: organization or team").click();
    await dialog.getByRole("combobox", { name: "Scope" }).click();
    await page
      .getByRole("option", { name: "Whole organization", exact: true })
      .click();
    await dialog.getByRole("combobox", { name: "Role" }).click();
    await expect(
      page.getByRole("option", { name: "Organization Administrator" }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Organization Owner" }),
    ).toHaveCount(0);
  });

  test("fails closed for a member opening the access URL directly", async ({
    page,
  }) => {
    await ensureE2EMember();
    await page.context().clearCookies();
    await loginWithCredentials(page, e2eMember);
    await page.goto("/en/members");

    await expect(page.getByText("Access could not be loaded")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
  });
});
