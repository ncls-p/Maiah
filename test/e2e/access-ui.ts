import { expect, type Page } from "@playwright/test";

export function workspaceOrganizationSelect(page: Page) {
  return page
    .locator("div.rounded-xl.border")
    .filter({
      has: page.getByRole("button", {
        name: "Project and organization settings",
        exact: true,
      }),
    })
    .getByRole("combobox", { name: "Organization", exact: true });
}

export function directoryOrganizationSelect(page: Page) {
  return page
    .getByRole("region", { name: "Organizations", exact: true })
    .getByRole("combobox", { name: "Organization", exact: true });
}

export async function openPersonActions(page: Page, name: string) {
  await page
    .getByRole("button", { name: `Actions for ${name}`, exact: true })
    .click();
}

export async function openPersonAccessDetails(page: Page, name: string) {
  await openPersonActions(page, name);
  await page
    .getByRole("menuitem", { name: "Access details", exact: true })
    .click();
  return page.getByRole("dialog", { name, exact: true });
}

export function assignmentsDialog(page: Page) {
  return page.getByRole("dialog", { name: /^Assignments for / });
}

export function accessSectionLink(page: Page, name: string) {
  return page
    .getByRole("navigation", {
      name: /Access sections|Rubriques des accès/,
    })
    .getByRole("link", { name, exact: true });
}

export async function openPersonAssignments(page: Page, name: string) {
  await openPersonAccessDetails(page, name);
  await page
    .getByRole("button", {
      name: `Manage assignments for ${name}`,
      exact: true,
    })
    .click();
  return assignmentsDialog(page);
}

export async function closeOpenDialogs(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if ((await dialog.count()) === 0) return;
    const closeButton = dialog.last().getByRole("button", { name: "Close" });
    if (await closeButton.count()) await closeButton.click();
    else await page.keyboard.press("Escape");
    expect(await dialog.count()).toBe(0);
  }).toPass();
}

export async function openPersonGrantAccess(page: Page, name: string) {
  await openPersonActions(page, name);
  const grant = page.getByRole("menuitem", {
    name: "Grant access",
    exact: true,
  });
  const change = page.getByRole("menuitem", {
    name: "Change role",
    exact: true,
  });
  await expect(grant.or(change)).toBeVisible();
  if (await grant.isVisible()) await grant.click();
  else await change.click();
  return page.getByRole("dialog", { name: "Grant access" });
}
