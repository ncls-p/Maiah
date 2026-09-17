import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.setTimeout(90_000);

test.beforeAll(async () => {
  await ensureE2EUser();
});
test.beforeEach(async ({ page }) => {
  await login(page);
});

test("tests a draft, follows the active node with the results closed, and cancels a retry", async ({
  page,
}) => {
  const workspaces = await (await page.request.get("/api/workspaces")).json();
  const workspaceId = (
    workspaces.find((row: { isActive: boolean }) => row.isActive) ??
    workspaces[0]
  ).workspace.id;
  const settings = { timeoutMs: 30_000, maxRetries: 0, retryDelayMs: 1000 };
  const create = await page.request.post("/api/workspace/workflows", {
    data: {
      workspaceId,
      name: "Execution journey",
    },
  });
  expect(create.status()).toBe(201);
  const { workflow } = await create.json();
  const configured = await page.request.patch(
    `/api/workspace/workflows/${workflow.id}`,
    {
      data: {
        workspaceId,
        definition: {
          schemaVersion: 1,
          defaultInput: { text: "a,b,c" },
          nodes: [
            {
              id: "trigger",
              type: "trigger.manual",
              label: "Start",
              position: { x: 0, y: 0 },
              parameters: {},
              settings,
            },
            {
              id: "wait",
              type: "logic.delay",
              label: "Wait for test",
              position: { x: 260, y: 0 },
              parameters: { delayMs: 7000 },
              settings,
            },
            {
              id: "split",
              type: "text.split",
              label: "Split result",
              position: { x: 520, y: 0 },
              parameters: { path: "text", separator: ",", outputPath: "items" },
              settings,
            },
          ],
          edges: [
            { id: "a", source: "trigger", target: "wait" },
            { id: "b", source: "wait", target: "split" },
          ],
        },
      },
    },
  );
  expect(configured.status()).toBe(200);
  try {
    await page.goto(`/en/workflows/${workflow.id}`);
    await page.getByRole("button", { name: "Test", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const input = dialog.getByRole("textbox");
    await input.fill("{invalid}");
    await expect(
      dialog.getByRole("button", { name: "Save and test" }),
    ).toBeDisabled();
    await input.fill('{"text":"a,b,c"}');
    const started = page.waitForResponse(
      (response) =>
        response.url().includes(`/workflows/${workflow.id}/runs`) &&
        response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Save and test" }).click();
    expect((await started).status()).toBe(202);
    await expect(page.getByRole("dialog")).toContainText("Wait for test", {
      timeout: 15000,
    });
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-id="wait"] [data-execution-status="running"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-id="split"] [data-execution-status="completed"]'),
    ).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "View results" }).click();
    await expect(page.getByRole("dialog")).toContainText('"items"');
    await page.getByRole("button", { name: "Test again" }).click();
    await page.getByRole("button", { name: "Save and test" }).click();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Cancelled");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-execution-status="running"]')).toHaveCount(
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Test", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "output/playwright/deo40-workflow-mobile.png",
      fullPage: true,
    });
  } finally {
    await page.request.delete(
      `/api/workspace/workflows/${workflow.id}?workspaceId=${workspaceId}`,
    );
  }
});
