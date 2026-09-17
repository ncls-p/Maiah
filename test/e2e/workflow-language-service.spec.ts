import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";
test.setTimeout(120_000);
test.beforeAll(ensureE2EUser);
test("local assistance knows the workflow input, supports both languages and can be disabled", async ({
  page,
}) => {
  await login(page);
  const requests: string[] = [];
  const activeWorkers = new Set<string>();
  page.on("worker", (worker) => {
    if (!worker.url().includes("/vendor/workflow-editor/")) return;
    activeWorkers.add(worker.url());
    worker.on("close", () => activeWorkers.delete(worker.url()));
  });
  page.on("request", (request) => {
    if (request.url().includes("/vendor/workflow-editor/"))
      requests.push(request.url());
  });
  const workspaces = await (await page.request.get("/api/workspaces")).json();
  const workspaceId = (
    workspaces.find((row: { isActive: boolean }) => row.isActive) ??
    workspaces[0]
  ).workspace.id;
  const settings = { timeoutMs: 30000, maxRetries: 0, retryDelayMs: 1000 };
  const created = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: "Browser language service" },
  });
  const { workflow } = await created.json();
  const code =
    '/** @type {import("./workflow-context").Input} */\nconst input = { count: 1 };\ninput.missing();\nwindow.alert("not available in Node");';
  await page.request.patch(`/api/workspace/workflows/${workflow.id}`, {
    data: {
      workspaceId,
      definition: {
        schemaVersion: 1,
        defaultInput: { count: 1 },
        nodes: [
          {
            id: "start",
            type: "trigger.manual",
            label: "Start",
            position: { x: 0, y: 0 },
            parameters: {},
            settings,
          },
          {
            id: "code",
            type: "code.execute",
            label: "Script test",
            position: { x: 260, y: 0 },
            parameters: { language: "node", code },
            settings,
          },
        ],
        edges: [{ id: "a", source: "start", target: "code" }],
      },
    },
  });
  try {
    await page.goto(`/en/workflows/${workflow.id}`);
    await page
      .locator(".react-flow__node")
      .filter({ hasText: "Script test" })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Code", exact: true }),
    ).toHaveValue(code);
    expect(requests).toHaveLength(0);
    const toggle = page.getByRole("button", {
      name: "Local assistance",
      exact: true,
    });
    await toggle.click();
    await expect(page.getByText("2 error(s)", { exact: false })).toBeVisible({
      timeout: 45000,
    });
    await page.getByText("Workflow context", { exact: true }).click();
    await expect(
      page.getByText('{ "count": number }', { exact: true }),
    ).toBeVisible();
    expect(requests.some((url) => url.includes("ts.worker"))).toBe(true);
    expect(requests.some((url) => url.includes("python.worker"))).toBe(false);
    await toggle.click();
    await expect(page.locator('iframe[title="Code editor"]')).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Code", exact: true }),
    ).toHaveValue(code);
    await expect.poll(() => activeWorkers.size).toBe(0);
    await page.getByRole("combobox").filter({ hasText: "JavaScript" }).click();
    await page.getByRole("option", { name: "Python", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Code", exact: true })
      .fill(
        'from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from workflow_context import Input\ninput: "Input" = {"count": 1}\nprint(input["missing"])',
      );
    await toggle.click();
    await expect(page.getByText("1 error(s)", { exact: false })).toBeVisible({
      timeout: 45000,
    });
    expect(requests.some((url) => url.includes("python.worker"))).toBe(true);
    await toggle.click();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("workflow-code-assistance"),
      ),
    ).toBe("false");
  } finally {
    await page.request.delete(
      `/api/workspace/workflows/${workflow.id}?workspaceId=${workspaceId}`,
    );
  }
});
