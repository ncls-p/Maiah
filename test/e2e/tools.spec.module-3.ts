import { expect, test } from "@playwright/test";

import { ensureE2EUser, login } from "./fixtures";

const longSkill = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "architecture-diagram-with-a-deliberately-long-responsive-name",
  description:
    "A deliberately long skill description used to protect every confirmation dialog from horizontal overflow.",
  sourcePackage: "organization/skills-with-a-long-package-name",
  sourceSkillName: "architecture-diagram",
  installCommand: "npx skills add organization/skills",
  markdownFilesJson: [{ path: "SKILL.md", content: "# Architecture" }],
  metadataJson: {},
  isGlobal: true,
  canEdit: true,
  createdAt: new Date().toISOString(),
  provenance: {
    scope: "organization",
    scopeName: "E2E organization with a long name",
    ownerName: "E2E Admin",
  },
};

test.describe("responsive destructive confirmations", () => {
  test.beforeAll(async () => {
    await ensureE2EUser();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.route(/\/api\/workspace\/skills\?/, async (route) => {
      await route.fulfill({ json: [longSkill] });
    });
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 919, height: 863 },
  ]) {
    test(`keeps long confirmation actions inside ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/fr/tools?tab=skills");
      const skill = page
        .getByRole("listitem")
        .filter({ hasText: longSkill.name });
      await skill.getByRole("button", { name: /Actions/i }).click();
      await page
        .getByRole("menuitem", { name: /Supprimer la compétence/i })
        .click();

      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await expect
        .poll(() =>
          dialog.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
        )
        .toBe(true);

      for (const button of await dialog.getByRole("button").all()) {
        await expect
          .poll(() =>
            button.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              const parent = element
                .closest('[data-slot="alert-dialog-content"]')
                ?.getBoundingClientRect();
              return Boolean(
                parent &&
                bounds.left >= parent.left &&
                bounds.right <= parent.right &&
                element.scrollWidth <= element.clientWidth + 1,
              );
            }),
          )
          .toBe(true);
      }
    });
  }
});

test("exposes and registers the installable PWA", async ({ page }) => {
  await page.goto("/en/chat");
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute("href", /manifest\.webmanifest/);

  const manifestResponse = await page.request.get(
    await manifestLink.evaluate((element) => (element as HTMLLinkElement).href),
  );
  expect(manifestResponse.ok()).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean(await navigator.serviceWorker.getRegistration("/")),
      ),
    )
    .toBe(true);
});
