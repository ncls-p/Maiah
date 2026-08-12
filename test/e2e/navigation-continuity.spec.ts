import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("keeps French desktop and mobile navigation inside the persistent document", async ({
  page,
}) => {
  let documentLoads = 0;
  page.on("load", () => {
    documentLoads += 1;
  });

  await page.goto("/fr/chat");
  await expect(page.locator('[data-slot="app-header"]')).toBeVisible({
    timeout: 15_000,
  });
  documentLoads = 0;

  const historySearch = page.getByRole("searchbox", {
    name: "Rechercher dans l’historique des chats",
  });
  await historySearch.fill("navigation persistante");
  const initialDocumentTimeOrigin = await page.evaluate(
    () => performance.timeOrigin,
  );
  for (const destination of [
    { label: "Assistants", path: "/fr/agents" },
    { label: "Outils", path: "/fr/tools" },
    { label: "Connaissances", path: "/fr/knowledge" },
    { label: "Planification", path: "/fr/scheduled-tasks" },
    { label: "Chat", path: "/fr/chat" },
  ]) {
    await page
      .getByRole("link", { name: destination.label, exact: true })
      .click();
    await expect(page).toHaveURL(destination.path);
    await expect(historySearch).toHaveValue("navigation persistante");
    expect(documentLoads).toBe(0);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(
      initialDocumentTimeOrigin,
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNavigation = page.locator('[data-slot="mobile-app-navigation"]');
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("link", { name: "Outils" }).click();
  await expect(page).toHaveURL(/\/fr\/tools$/);
  await expect(page.locator('[data-slot="app-header"]')).toBeVisible();
  expect(documentLoads).toBe(0);
});
