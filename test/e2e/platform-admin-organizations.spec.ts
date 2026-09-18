import { test, expect } from "@playwright/test";
import { Client } from "pg";
import {
  databaseUrl,
  ensureE2EAssistant,
  ensureE2EMember,
  e2eMember,
  login,
  loginWithCredentials,
} from "./fixtures";

test("another application admin sees and manages organizations without membership, until revoked", async ({
  page,
  browser,
}) => {
  await ensureE2EAssistant();
  await ensureE2EMember();
  await login(page);
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  const context = await browser.newContext();
  let organizationId: string | undefined;
  try {
    await client.query('update "user" set role = $1 where email = $2', [
      "admin",
      e2eMember.email,
    ]);
    const other = await context.newPage();
    await loginWithCredentials(other, e2eMember);
    const name = `Global admins ${Date.now()}`;
    const creation = await page.request.post("/api/organizations", {
      data: { action: "createOrganization", name },
    });
    expect(creation.status()).toBe(201);
    organizationId = (await creation.json()).organization.id;
    const directory = await (
      await other.request.get("/api/organizations")
    ).json();
    expect(directory.organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: organizationId,
          projects: [],
          canManageSettings: true,
        }),
      ]),
    );
    expect(
      (
        await other.request.get(
          `/api/workspace/branding?organizationId=${organizationId}`,
        )
      ).status(),
    ).toBe(200);
    const creationProject = await page.request.post("/api/organizations", {
      data: {
        action: "createProject",
        name: "Foreign admin project",
        organizationId,
      },
    });
    expect(creationProject.status()).toBe(201);
    const workspaceId = (await creationProject.json()).project.id;
    const projects = await (await other.request.get("/api/workspaces")).json();
    expect(projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspace: expect.objectContaining({ id: workspaceId }),
          member: null,
          organizationMember: null,
        }),
      ]),
    );
    expect(
      (
        await other.request.patch("/api/workspaces", { data: { workspaceId } })
      ).status(),
    ).toBe(204);
    expect(
      (
        await other.request.put("/api/workspace/branding", {
          data: { organizationId, theme: "ocean", logoUrl: null },
        })
      ).status(),
    ).toBe(200);
    await other.goto("/en/members");
    await expect(
      other.getByRole("combobox", { name: "Organization", exact: true }),
    ).toHaveText(name);
    await expect(
      other.getByRole("combobox", { name: "Active project", exact: true }),
    ).toHaveText("Foreign admin project");
    await expect(
      other.getByRole("link", { name: "People", exact: true }),
    ).toBeVisible();
    await client.query('update "user" set role = $1 where email = $2', [
      "user",
      e2eMember.email,
    ]);
    expect(
      (
        await other.request.patch("/api/workspaces", { data: { workspaceId } })
      ).status(),
    ).toBe(403);
    expect(
      (
        await other.request.get(
          `/api/workspace/branding?organizationId=${organizationId}`,
        )
      ).status(),
    ).toBe(404);
    const revokedDirectory = await (
      await other.request.get("/api/organizations")
    ).json();
    expect(
      revokedDirectory.organizations.some(
        (row: { id: string }) => row.id === organizationId,
      ),
    ).toBe(false);
    const revokedProjects = await (
      await other.request.get("/api/workspaces")
    ).json();
    expect(
      revokedProjects.some(
        (row: { workspace: { id: string } }) =>
          row.workspace.id === workspaceId,
      ),
    ).toBe(false);
  } finally {
    await context.close();
    await client.query('update "user" set role = $1 where email = $2', [
      "user",
      e2eMember.email,
    ]);
    if (organizationId)
      await client.query("delete from organizations where id = $1", [
        organizationId,
      ]);
    await client.end();
  }
});
