import { expect, test } from "@playwright/test";
import { ensureE2EAssistant, login } from "./fixtures";

test.describe("retired custom tools builder", () => {
  test("redirects old custom tools links to workflows", async ({ page }) => {
    await page.goto("/en/custom-tools");
    await expect(page).toHaveURL(/\/en\/workflows/);
  });

  test("does not expose a custom tools tab", async ({ page }) => {
    await page.goto("/en/tools");
    await expect(
      page.getByRole("tab", { name: "Custom", exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("scheduled tasks page", () => {
  test.beforeAll(async () => {
    await ensureE2EAssistant();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("loads scheduled tasks page", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await expect(page).toHaveURL(/\/en\/scheduled-tasks/);

    await expect(
      page.getByRole("heading", {
        name: /Automate, without losing control\./i,
      }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows scheduled tasks empty state", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await page.waitForTimeout(2000);

    await expect(
      page.getByText(/Scheduled tasks|No scheduled|Create/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("scheduled tasks page description exists", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await page.waitForTimeout(2000);

    // Should have a description about scheduling
    await expect(
      page.getByText(/Schedule|automatic|assistants/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("opens task details and edits its configuration", async ({ page }) => {
    const suffix = Date.now();
    const title = `Editable task ${suffix}`;
    const updatedTitle = `Updated task ${suffix}`;
    await page.goto("/en/scheduled-tasks");

    await page.getByRole("button", { name: "Create task" }).click();
    const createDialog = page.getByRole("dialog", { name: "Create a task" });
    await createDialog.getByLabel("Title").fill(title);
    await createDialog
      .getByLabel("Instructions")
      .fill("Prepare a concise daily status report.");
    await createDialog.getByRole("button", { name: "Create task" }).click();

    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `View and edit ${title}` }).click();
    const editDialog = page.getByRole("dialog", { name: "Task details" });
    await expect(editDialog.getByText("Next run")).toBeVisible();
    await expect(editDialog.getByText("Time zone")).toBeVisible();
    await editDialog.getByLabel("Title").fill(updatedTitle);
    await editDialog.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();
  });
});
