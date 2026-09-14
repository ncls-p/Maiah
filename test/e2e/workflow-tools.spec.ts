import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});
test.beforeEach(async ({ page }) => {
  await login(page);
});

test("tool contracts open in full screen with highlighted JSON on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/en/tools");
  const inspect = page.getByRole("button", {
    name: "Inspect how calculator works",
    exact: true,
  });
  await inspect.click();
  await expect(page.getByRole("dialog")).toContainText("expression");
  const expand = page.getByRole("button", {
    name: "Open Input parameters (JSON Schema) full screen",
    exact: true,
  });
  await expand.click();
  let full = page.getByRole("dialog").last();
  await expect(
    full.getByRole("button", { name: "Copy", exact: true }),
  ).toBeVisible();
  await expect(full.locator('code span[class*="text-blue"]')).not.toHaveCount(
    0,
  );
  await expect(full.locator('code span[class*="text-green"]')).not.toHaveCount(
    0,
  );
  await expect
    .poll(async () => Math.round((await full.boundingBox())!.width))
    .toBe(page.viewportSize()!.width);
  await page.keyboard.press("Escape");
  await expect(expand).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expand.click();
  full = page.getByRole("dialog").last();
  await expect
    .poll(async () => Math.round((await full.boundingBox())!.width))
    .toBe(390);
  await page.screenshot({
    path: "output/playwright/workflow-tool-json-mobile.png",
  });
  await page.keyboard.press("Escape");
  await expect(expand).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(inspect).toBeFocused();
});

test("direct tools use typed variables, execute by API and can be scheduled without an assistant", async ({
  page,
}) => {
  const workspaces = await (await page.request.get("/api/workspaces")).json();
  const workspaceId = (
    workspaces.find((row: { isActive: boolean }) => row.isActive) ??
    workspaces[0]
  ).workspace.id;
  const catalogResponse = await page.request.get(
    `/api/workspace/workflows/tools?workspaceId=${workspaceId}`,
  );
  expect(catalogResponse.ok()).toBeTruthy();
  const { tools } = await catalogResponse.json();
  const calculator = tools.find(
    (tool: { name: string }) => tool.name === "Calculator",
  );
  expect(calculator).toBeTruthy();
  const created = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: `Direct tool E2E ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const { workflow } = await created.json();
  const settings = { timeoutMs: 30000, maxRetries: 0, retryDelayMs: 1000 };
  const definition = {
    schemaVersion: 1,
    defaultInput: { expression: "6 * 7" },
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        label: "Starting data",
        position: { x: 80, y: 100 },
        parameters: {},
        settings,
      },
      {
        id: "calculate",
        type: "tool.call",
        label: "Calculate",
        position: { x: 390, y: 100 },
        parameters: {
          source: "builtin",
          toolId: calculator.id,
          arguments: { expression: "{{expression}}" },
          outputPath: "answer",
        },
        settings,
      },
    ],
    edges: [{ id: "next", source: "trigger", target: "calculate" }],
  };
  const saved = await page.request.patch(
    `/api/workspace/workflows/${workflow.id}`,
    { data: { workspaceId, definition } },
  );
  expect(saved.ok()).toBeTruthy();
  await page.goto(`/en/workflows/${workflow.id}`);
  await page
    .getByTestId("rf__node-calculate")
    .getByText("Calculate", { exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Variable", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText('Example from starting data: "6 * 7"', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/workflow-direct-tool-desktop.png",
  });
  expect(
    (
      await page.request.post(
        `/api/workspace/workflows/${workflow.id}/publish`,
        { data: { workspaceId } },
      )
    ).ok(),
  ).toBeTruthy();
  const runResponse = await page.request.post(
    `/api/workspace/workflows/${workflow.id}/runs`,
    {
      data: {
        workspaceId,
        input: { expression: "6 * 7" },
        idempotencyKey: `direct-${workflow.id}`,
      },
    },
  );
  expect(runResponse.status()).toBe(202);
  const { run } = await runResponse.json();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/workspace/workflow-runs/${run.id}?workspaceId=${workspaceId}`,
        );
        return (await response.json()).run.status;
      },
      { timeout: 30000 },
    )
    .toBe("completed");
  const detail = await (
    await page.request.get(
      `/api/workspace/workflow-runs/${run.id}?workspaceId=${workspaceId}`,
    )
  ).json();
  expect(JSON.stringify(detail.run.outputJson)).toContain("42");
  const parentCreated = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: `Parent E2E ${Date.now()}` },
  });
  expect(parentCreated.status()).toBe(201);
  const parent = (await parentCreated.json()).workflow;
  const parentDefinition = {
    ...definition,
    nodes: [
      definition.nodes[0],
      {
        id: "child",
        type: "workflow.run",
        label: "Child calculation",
        position: { x: 390, y: 100 },
        parameters: {
          workflowId: workflow.id,
          input: "{{input}}",
          outputPath: "childResult",
        },
        settings,
      },
    ],
    edges: [{ id: "child-edge", source: "trigger", target: "child" }],
  };
  expect(
    (
      await page.request.patch(`/api/workspace/workflows/${parent.id}`, {
        data: { workspaceId, definition: parentDefinition },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto(`/en/workflows/${parent.id}`);
  await page.getByText("Child calculation", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Child workflow", exact: true }),
  ).toContainText(workflow.name);
  expect(
    (
      await page.request.post(`/api/workspace/workflows/${parent.id}/publish`, {
        data: { workspaceId },
      })
    ).ok(),
  ).toBeTruthy();
  const parentRunResponse = await page.request.post(
    `/api/workspace/workflows/${parent.id}/runs`,
    {
      data: {
        workspaceId,
        input: { expression: "7*8" },
        idempotencyKey: `parent-${parent.id}`,
      },
    },
  );
  expect(parentRunResponse.status()).toBe(202);
  const parentRun = (await parentRunResponse.json()).run;
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(
              `/api/workspace/workflow-runs/${parentRun.id}?workspaceId=${workspaceId}`,
            )
          ).json()
        ).run.status,
      { timeout: 30000 },
    )
    .toBe("completed");
  const parentDetail = (
    await (
      await page.request.get(
        `/api/workspace/workflow-runs/${parentRun.id}?workspaceId=${workspaceId}`,
      )
    ).json()
  ).run;
  expect(JSON.stringify(parentDetail.outputJson)).toContain("56");
  expect(parentDetail.childRunsStarted).toBe(1);
  await page.goto("/en/scheduled-tasks");
  await page
    .getByRole("button", {
      name: /Create automation|Create task|Create scheduled task/i,
    })
    .first()
    .click();
  await page.getByRole("combobox", { name: "Run", exact: true }).click();
  await page.getByRole("option", { name: "Workflow", exact: true }).click();
  await page.getByRole("combobox", { name: "Workflow", exact: true }).click();
  await page.getByRole("option", { name: workflow.name, exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Assistant", exact: true }),
  ).toHaveCount(0);
  const taskResponse = await page.request.post(
    "/api/workspace/scheduled-tasks",
    {
      data: {
        workspaceId,
        workflowId: workflow.id,
        title: "Scheduled calculation",
        workflowInput: { expression: "2+3" },
        frequency: "interval",
        intervalMinutes: 30,
        enabled: false,
      },
    },
  );
  expect(taskResponse.status()).toBe(201);
  const { task } = await taskResponse.json();
  expect(task.agentId).toBeNull();
  await page.request.delete(
    `/api/workspace/scheduled-tasks/${task.id}?workspaceId=${workspaceId}`,
  );
});

test("ServiceNow connections show only credentials for the selected login method", async ({
  page,
}) => {
  const {
    SERVICE_NOW_CONFIG_SCHEMA,
    SERVICE_NOW_SECRET_SCHEMA,
    SERVICE_NOW_DEFAULT_CONFIG,
  } =
    await import("@/components/mcp/mcp-server-manager/tool-connections-panel.json-record");
  await page.route("**/api/workspace/tool-connectors?*", (route) =>
    route.fulfill({
      json: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          key: "servicenow",
          name: "ServiceNow",
          enabled: true,
          kind: "mcp",
          configSchema: SERVICE_NOW_CONFIG_SCHEMA,
          secretSchema: SERVICE_NOW_SECRET_SCHEMA,
          defaultConfig: SERVICE_NOW_DEFAULT_CONFIG,
        },
      ],
    }),
  );
  await page.route("**/api/workspace/tool-connections?*", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/en/tools?tab=mcp");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Connections", exact: true })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  const dialog = page.getByRole("dialog").last();
  await expect(
    dialog.locator("#tool-connection-secret-username"),
  ).toBeVisible();
  await expect(
    dialog.locator("#tool-connection-secret-password"),
  ).toBeVisible();
  await expect(dialog.locator("#tool-connection-secret-clientId")).toHaveCount(
    0,
  );
  await expect(dialog.locator("#tool-connection-secret-apiKey")).toHaveCount(0);
  await dialog
    .locator("#tool-connection-secret-password")
    .fill("temporary-test-value");
  await dialog
    .getByRole("combobox", { name: "Authentication type", exact: true })
    .click();
  await page.getByRole("option", { name: "API key", exact: true }).click();
  await expect(dialog.locator("#tool-connection-secret-apiKey")).toBeVisible();
  await expect(dialog.locator("#tool-connection-secret-password")).toHaveCount(
    0,
  );
  await dialog
    .getByRole("combobox", { name: "Authentication type", exact: true })
    .click();
  await page.getByRole("option", { name: /OAuth/ }).click();
  await expect(
    dialog.locator("#tool-connection-secret-clientId"),
  ).toBeVisible();
  await expect(
    dialog.locator("#tool-connection-secret-clientSecret"),
  ).toBeVisible();
  await expect(dialog.locator("#tool-connection-secret-password")).toHaveValue(
    "",
  );
  await expect(dialog.locator("#tool-connection-secret-apiKey")).toHaveCount(0);
});
