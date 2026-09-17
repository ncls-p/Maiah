import { expect } from "@playwright/test";
import { test } from "./access-memberships.fixtures";
import { directoryOrganizationSelect } from "./access-ui";
import { ensureE2EAssistant, login } from "./fixtures";

test("creates an organization and project with buttons and filters projects by organization", async ({
  page,
  cleanupOrganization,
}) => {
  const { workspaceId } = await ensureE2EAssistant();
  await login(page);
  await page.request.patch("/api/workspaces", { data: { workspaceId } });
  await page.goto("/en/admin/settings");
  const originalProject = await page
    .getByRole("combobox", { name: "Active project", exact: true })
    .first()
    .innerText();
  const name = `Selection organization ${Date.now()}`;
  await page
    .getByRole("textbox", { name: "New organization name", exact: true })
    .fill(name);
  const creation = page.getByRole("form", {
    name: "Create organization",
    exact: true,
  });
  await expect(creation.getByRole("textbox")).toHaveCount(1);
  const request = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/organizations") &&
      request.method() === "POST",
  );
  await creation
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  expect((await request).postDataJSON()).toEqual({
    action: "createOrganization",
    name,
  });
  await expect(directoryOrganizationSelect(page)).toHaveText(name);
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Selection demo");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Selection demo", exact: true }),
  ).toBeVisible();
  const directory = await (await page.request.get("/api/organizations")).json();
  const organization = directory.organizations.find(
    (row: { name: string }) => row.name === name,
  );
  cleanupOrganization({
    workspaceId: organization.projects[0].id,
    organizationName: name,
    cookies: await page.context().cookies(),
  });
  await page.goto("/en/members");
  const project = page.getByRole("combobox", {
    name: "Active project",
    exact: true,
  });
  await expect(project).toHaveText("Selection demo");
  await project.click();
  await expect(
    page.getByRole("option", { name: "Selection demo", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("option", { name: originalProject, exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator("body")
      .evaluate((element) => element.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
