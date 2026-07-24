import { existsSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("builds, publishes, and executes a no-code workflow through the API", async ({
  page,
}) => {
  const workspacesResponse = await page.request.get("/api/workspaces");
  expect(workspacesResponse.ok()).toBeTruthy();
  const workspaces = (await workspacesResponse.json()) as Array<{
    workspace: { id: string };
  }>;
  const workspaceId = workspaces[0]?.workspace.id;
  expect(workspaceId).toBeTruthy();

  await page.goto("/en/workflows");
  const workflowCreation = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/workspace/workflows") &&
      response.request().method() === "POST" &&
      response.status() === 201,
  );
  await page.getByRole("button", { name: "New workflow" }).first().click();
  const createdWorkflow = (await (await workflowCreation).json()) as {
    workflow: { id: string };
  };
  const workflowId = createdWorkflow.workflow.id;
  await expect(page).toHaveURL(new RegExp(`/en/workflows/${workflowId}$`), {
    timeout: 10_000,
  });

  await page
    .getByRole("textbox", { name: "Workflow name" })
    .fill(`No-code API E2E ${Date.now()}`);
  await page
    .getByRole("button", { name: /Set data Adds or replaces fields/i })
    .click();
  await expect(page.getByRole("textbox", { name: "Step name" })).toHaveValue(
    "Set data",
  );

  await page
    .getByRole("button", { name: "Open the editor in full screen" })
    .click();
  await expect(
    page.getByRole("button", { name: "Exit full screen" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Open step library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open configuration" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  const createKeyResponse = await page.request.post("/api/workspace/api-keys", {
    data: {
      workspaceId,
      name: `Workflow E2E ${Date.now()}`,
      scopes: ["workflows.execute", "workflows.view"],
    },
  });
  expect(createKeyResponse.status()).toBe(201);
  const createdKey = (await createKeyResponse.json()) as {
    rawKey: string;
    apiKey: { id: string };
  };
  const bearerHeaders = {
    Authorization: `Bearer ${createdKey.rawKey}`,
  };
  const idempotencyKey = `workflow-e2e-${Date.now()}`;

  try {
    const execute = () =>
      page.request.post(`/api/workspace/workflows/${workflowId}/runs`, {
        headers: bearerHeaders,
        data: {
          workspaceId,
          input: { message: "Bonjour" },
          idempotencyKey,
        },
      });

    const concurrentResponses = await Promise.all(
      Array.from({ length: 5 }, () => execute()),
    );
    expect(
      concurrentResponses.every((response) => response.status() === 202),
    ).toBeTruthy();
    const concurrentRuns = (await Promise.all(
      concurrentResponses.map((response) => response.json()),
    )) as Array<{ run: { id: string; status: string } }>;
    const firstRun = concurrentRuns[0]!;
    expect(firstRun.run.status).toBe("queued");
    expect(new Set(concurrentRuns.map(({ run }) => run.id))).toEqual(
      new Set([firstRun.run.id]),
    );

    const runsResponse = await page.request.get(
      `/api/workspace/workflows/${workflowId}/runs?workspaceId=${workspaceId}`,
      { headers: bearerHeaders },
    );
    expect(runsResponse.status()).toBe(200);
    const runs = (await runsResponse.json()) as {
      runs: Array<{ id: string }>;
    };
    expect(runs.runs.some(({ id }) => id === firstRun.run.id)).toBeTruthy();

    await expect
      .poll(
        async () => {
          const detailResponse = await page.request.get(
            `/api/workspace/workflow-runs/${firstRun.run.id}?workspaceId=${workspaceId}`,
            { headers: bearerHeaders },
          );
          expect(detailResponse.status()).toBe(200);
          const detail = (await detailResponse.json()) as {
            run: {
              status: string;
              steps: Array<{ status: string }>;
            };
          };
          return {
            status: detail.run.status,
            stepCount: detail.run.steps.length,
            stepsCompleted: detail.run.steps.every(
              ({ status }) => status === "completed",
            ),
          };
        },
        { timeout: 15_000 },
      )
      .toEqual({
        status: "completed",
        stepCount: 2,
        stepsCompleted: true,
      });

    const detailResponse = await page.request.get(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
    expect(detailResponse.status()).toBe(200);
    const detail = (await detailResponse.json()) as {
      workflow: {
        definition: {
          schemaVersion: 1;
          nodes: unknown[];
          edges: unknown[];
        };
      };
    };
    const concurrentSaves = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        page.request.patch(`/api/workspace/workflows/${workflowId}`, {
          data: {
            workspaceId,
            name: `Concurrent save ${index}`,
            definition: detail.workflow.definition,
          },
        }),
      ),
    );
    expect(
      concurrentSaves.every((response) => response.status() === 200),
    ).toBeTruthy();
    const savedVersions = (await Promise.all(
      concurrentSaves.map((response) => response.json()),
    )) as Array<{ workflow: { latestVersion: number } }>;
    expect(
      new Set(savedVersions.map(({ workflow }) => workflow.latestVersion)).size,
    ).toBe(5);
  } finally {
    await page.request.delete(
      `/api/workspace/api-keys/${createdKey.apiKey.id}?workspaceId=${workspaceId}`,
    );
    await page.request.delete(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
  }
});

test("switches between visual and agentic editing while keeping live changes", async ({
  page,
}) => {
  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string } }>;
  const workspaceId = workspaces[0]!.workspace.id;
  const createResponse = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: `Agentic E2E ${Date.now()}` },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as {
    workflow: { id: string };
  };
  const workflowId = created.workflow.id;
  const definition = {
    schemaVersion: 1,
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        label: "API trigger",
        position: { x: 80, y: 180 },
        parameters: {},
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
      {
        id: "condition",
        type: "logic.condition",
        label: "Message received?",
        position: { x: 380, y: 180 },
        parameters: {
          path: "message",
          operator: "exists",
        },
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
      {
        id: "summary",
        type: "data.template",
        label: "Prepare summary",
        position: { x: 680, y: 100 },
        parameters: {
          template: "Summary: {{message}}",
          outputPath: "summary",
        },
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
      {
        id: "fallback",
        type: "data.template",
        label: "Prepare fallback",
        position: { x: 680, y: 280 },
        parameters: {
          template: "No message received",
          outputPath: "summary",
        },
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
      {
        id: "debug",
        type: "debug.snapshot",
        label: "Inspect output",
        position: { x: 980, y: 100 },
        parameters: {
          note: "Verify the final summary",
        },
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
    ],
    edges: [
      {
        id: "edge-trigger-condition",
        source: "trigger",
        target: "condition",
        sourceHandle: null,
      },
      {
        id: "edge-condition-summary",
        source: "condition",
        target: "summary",
        sourceHandle: "true",
      },
      {
        id: "edge-condition-fallback",
        source: "condition",
        target: "fallback",
        sourceHandle: "false",
      },
    ],
  };

  try {
    await page.route(
      `**/api/workspace/workflows/${workflowId}/agentic`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              messages: [],
              pendingRequests: [],
            }),
          });
          return;
        }
        const events = [
          { type: "agent", name: "Workflow assistant" },
          {
            type: "tool_start",
            id: "tool-1",
            toolName: "replace_workflow",
            label: "Building the workflow",
          },
          {
            type: "tool_result",
            id: "tool-1",
            toolName: "replace_workflow",
            label: "Building the workflow",
          },
          {
            type: "workflow",
            draft: {
              name: "Live summary",
              description: null,
              definition,
            },
          },
          { type: "text", delta: "**The summary workflow is ready.**" },
          { type: "done" },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
        });
      },
    );

    await page.goto(`/en/workflows/${workflowId}`);
    await page.getByRole("button", { name: "Agentic" }).click();
    await expect(
      page.getByRole("heading", { name: "Build with an agent" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", {
        name: /When a request arrives, have an assistant analyze it/i,
      })
      .fill("Build a summary workflow");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Using Workflow assistant")).toBeVisible();
    await expect(page.getByText("Building the workflow")).toBeVisible();
    await expect(
      page.getByText("Prepare summary", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("The summary workflow is ready."),
    ).toBeVisible();
    await expect(
      page.locator('[data-streamdown="strong"]').filter({
        hasText: "The summary workflow is ready.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Workflow name" }),
    ).toHaveValue("Live summary");
    const conditionNode = page.locator(
      '.react-flow__node[data-id="condition"]',
    );
    await expect(
      conditionNode.locator('.react-flow__handle-right[data-handleid="true"]'),
    ).toHaveCount(1);
    await expect(
      conditionNode.locator('.react-flow__handle-right[data-handleid="false"]'),
    ).toHaveCount(1);

    await page.getByText("Prepare summary", { exact: true }).last().click();
    const stepName = page.getByRole("textbox", { name: "Step name" });
    await expect(stepName).toBeVisible();
    await stepName.fill("Prepare concise summary");
    await expect(
      page.getByText("Prepare concise summary", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(stepName).not.toBeVisible();

    const summaryNode = page.locator('.react-flow__node[data-id="summary"]');
    const beforeMove = await summaryNode.boundingBox();
    expect(beforeMove).not.toBeNull();
    await page.mouse.move(
      beforeMove!.x + beforeMove!.width / 2,
      beforeMove!.y + beforeMove!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      beforeMove!.x + beforeMove!.width / 2 - 80,
      beforeMove!.y + beforeMove!.height / 2 + 40,
      { steps: 6 },
    );
    await page.mouse.up();
    const afterMove = await summaryNode.boundingBox();
    expect(Math.abs(afterMove!.x - beforeMove!.x)).toBeGreaterThan(40);

    const summarySource = summaryNode.locator(
      ".react-flow__handle-right.source",
    );
    const debugTarget = page
      .locator('.react-flow__node[data-id="debug"]')
      .locator(".react-flow__handle-left.target");
    await expect(summarySource).toHaveCount(1);
    await expect(debugTarget).toHaveCount(1);
    const sourceBox = await summarySource.boundingBox();
    const targetBox = await debugTarget.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(page.locator(".react-flow__edge")).toHaveCount(4);

    await page.getByRole("button", { name: "Visual" }).click();
    await expect(page.getByText("Steps", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Prepare concise summary", { exact: true }),
    ).toBeVisible();
  } finally {
    await page.request.delete(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
  }
});

test("collects sensitive workflow information without exposing it in chat", async ({
  page,
}) => {
  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string } }>;
  const workspaceId = workspaces[0]!.workspace.id;
  const createResponse = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: `Agentic secure input ${Date.now()}` },
  });
  expect(createResponse.status()).toBe(201);
  const workflowId = (
    (await createResponse.json()) as { workflow: { id: string } }
  ).workflow.id;
  const requestId = "77777777-7777-4777-8777-777777777777";

  try {
    await page.route(
      `**/api/workspace/workflows/${workflowId}/agentic`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ messages: [], pendingRequests: [] }),
          });
          return;
        }
        const body = route.request().postDataJSON() as {
          inputRequestId?: string;
        };
        const events = body.inputRequestId
          ? [
              {
                type: "text",
                delta: "The connection was configured securely.",
              },
              { type: "done" },
            ]
          : [
              { type: "agent", name: "Workflow assistant" },
              {
                type: "input_request",
                request: {
                  id: requestId,
                  title: "API connection",
                  description: "Provide the required connection details.",
                  fields: [
                    {
                      name: "api_key",
                      label: "API key",
                      type: "secret",
                      sensitive: true,
                      required: true,
                    },
                    {
                      name: "base_url",
                      label: "Base URL",
                      type: "url",
                      sensitive: false,
                      required: true,
                    },
                  ],
                  expiresAt: "2099-07-23T10:00:00.000Z",
                },
              },
              {
                type: "text",
                delta: "Please provide the connection details.",
              },
              { type: "done" },
            ];
        await route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
        });
      },
    );
    await page.route(
      `**/api/workspace/workflows/${workflowId}/agentic/inputs/${requestId}`,
      async (route) => {
        const body = route.request().postDataJSON() as {
          values: Record<string, string>;
        };
        expect(body.values).toEqual({
          api_key: "sk-e2e-private",
          base_url: "https://api.example.com",
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: requestId,
            displayMessage: "The requested information was provided securely.",
          }),
        });
      },
    );

    await page.goto(`/en/workflows/${workflowId}`);
    await page.getByRole("button", { name: "Agentic" }).click();
    await page
      .getByRole("textbox", {
        name: /When a request arrives, have an assistant analyze it/i,
      })
      .fill("Connect this workflow to my API");
    await page.getByRole("button", { name: "Send" }).click();

    const apiKey = page.getByLabel("API key");
    await expect(apiKey).toHaveAttribute("type", "password");
    await apiKey.fill("sk-e2e-private");
    await page.getByLabel("Base URL").fill("https://api.example.com");
    const continuation = page.waitForRequest((request) => {
      if (
        request.method() !== "POST" ||
        !request.url().endsWith(`/workflows/${workflowId}/agentic`)
      ) {
        return false;
      }
      return (
        (request.postDataJSON() as { inputRequestId?: string })
          .inputRequestId === requestId
      );
    });
    await page.getByRole("button", { name: "Submit" }).click();
    await continuation;

    await expect(
      page.getByText("The connection was configured securely."),
    ).toBeVisible();
    await expect(page.getByText("sk-e2e-private")).toHaveCount(0);
  } finally {
    await page.request.delete(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
  }
});

test("shows the live checklist, approves an agentic run, and opens debug details", async ({
  page,
}) => {
  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string } }>;
  const workspaceId = workspaces[0]!.workspace.id;
  const createResponse = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: `Agentic approval ${Date.now()}` },
  });
  expect(createResponse.status()).toBe(201);
  const workflowId = (
    (await createResponse.json()) as { workflow: { id: string } }
  ).workflow.id;
  const requestId = "88888888-8888-4888-8888-888888888888";
  const runId = "99999999-9999-4999-8999-999999999999";
  const todoList = {
    kind: "chat_todo_list",
    title: "News workflow",
    items: [
      { id: "build", label: "Build the workflow", status: "completed" },
      { id: "test", label: "Test the workflow", status: "completed" },
    ],
    completedCount: 2,
    totalCount: 2,
  };

  try {
    await page.route(
      `**/api/workspace/workflows/${workflowId}/agentic`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              messages: [],
              pendingRequests: [],
              runRequests: [],
              todoList: null,
            }),
          });
          return;
        }
        const events = [
          { type: "agent", name: "Workflow assistant" },
          { type: "todo_list", todoList },
          {
            type: "run_request",
            request: {
              id: requestId,
              title: "Test the news workflow",
              reason: "Verify the HTTP response before publishing.",
              inputPreview: { topic: "technology", apiKey: "[REDACTED]" },
              expectedVersion: 2,
              status: "pending",
              expiresAt: "2099-07-23T10:00:00.000Z",
            },
          },
          {
            type: "text",
            delta: "The workflow is tested and waiting for your approval.",
          },
          { type: "done" },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
        });
      },
    );
    await page.route(
      `**/api/workspace/workflows/${workflowId}/agentic/runs/${requestId}`,
      async (route) => {
        expect(route.request().postDataJSON()).toEqual({
          workspaceId,
          decision: "approve",
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            requestId,
            status: "approved",
            runId,
          }),
        });
      },
    );
    await page.route(
      `**/api/workspace/workflows/${workflowId}/runs?*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            runs: [
              {
                id: runId,
                status: "failed",
                queuedAt: "2026-07-23T15:34:43.000Z",
                completedAt: "2026-07-23T15:34:44.000Z",
                outputJson: null,
                error: "Fetch news (fetch_news): HTTP 401: invalid API key",
              },
            ],
          }),
        });
      },
    );
    await page.route(
      `**/api/workspace/workflow-runs/${runId}?*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            run: {
              id: runId,
              status: "failed",
              queuedAt: "2026-07-23T15:34:43.000Z",
              startedAt: "2026-07-23T15:34:43.100Z",
              completedAt: "2026-07-23T15:34:44.000Z",
              inputJson: { topic: "technology" },
              outputJson: null,
              error: "Fetch news (fetch_news): HTTP 401: invalid API key",
              steps: [
                {
                  id: "step-1",
                  runId,
                  nodeId: "fetch_news",
                  nodeType: "http.request",
                  status: "failed",
                  attempt: 1,
                  inputJson: { topic: "technology" },
                  outputJson: null,
                  error: "HTTP 401: invalid API key",
                  startedAt: "2026-07-23T15:34:43.100Z",
                  completedAt: "2026-07-23T15:34:44.000Z",
                },
              ],
            },
          }),
        });
      },
    );

    await page.goto(`/en/workflows/${workflowId}`);
    await page.getByRole("button", { name: "Agentic" }).click();
    await page
      .getByRole("textbox", {
        name: /When a request arrives, have an assistant analyze it/i,
      })
      .fill("Test this news workflow");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(
      page.getByRole("heading", { name: "News workflow", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("2/2 tasks completed")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Test the news workflow",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("[REDACTED]")).toBeVisible();
    await page.getByRole("button", { name: "Approve and run" }).click();

    await expect(
      page.getByRole("heading", { name: "Run details" }),
    ).toBeVisible();
    await expect(page.getByText("HTTP 401: invalid API key")).toBeVisible();
    await expect(page.getByText("Step input")).toBeVisible();
    await expect(page.getByText('"topic": "technology"')).toBeVisible();
  } finally {
    await page.request.delete(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
  }
});

test("executes JavaScript and Python workflow steps in the local sandbox", async ({
  page,
}) => {
  test.skip(
    !existsSync(".data/sandbox-runner/sandbox.sock"),
    "The optional local sandbox runner is not available.",
  );

  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string } }>;
  const workspaceId = workspaces[0]!.workspace.id;
  const createResponse = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: `Sandbox E2E ${Date.now()}` },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as {
    workflow: { id: string };
  };
  const workflowId = created.workflow.id;
  const settings = {
    timeoutMs: 30_000,
    maxRetries: 0,
    retryDelayMs: 1_000,
  };

  try {
    const updateResponse = await page.request.patch(
      `/api/workspace/workflows/${workflowId}`,
      {
        data: {
          workspaceId,
          definition: {
            schemaVersion: 1,
            nodes: [
              {
                id: "trigger",
                type: "trigger.manual",
                label: "Trigger",
                position: { x: 0, y: 0 },
                parameters: {},
                settings,
              },
              {
                id: "javascript",
                type: "code.execute",
                label: "JavaScript",
                position: { x: 250, y: 0 },
                parameters: {
                  language: "node",
                  code: [
                    "const chunks = [];",
                    "for await (const chunk of process.stdin) chunks.push(chunk);",
                    "const input = JSON.parse(Buffer.concat(chunks).toString());",
                    "console.log(JSON.stringify({ ...input, value: input.value + 1, javascript: true }));",
                  ].join("\n"),
                },
                settings,
              },
              {
                id: "python",
                type: "code.execute",
                label: "Python",
                position: { x: 500, y: 0 },
                parameters: {
                  language: "python",
                  code: [
                    "import json, sys",
                    "data = json.load(sys.stdin)",
                    "data['value'] *= 2",
                    "data['python'] = True",
                    "print(json.dumps(data))",
                  ].join("\n"),
                },
                settings,
              },
            ],
            edges: [
              {
                id: "trigger-javascript",
                source: "trigger",
                target: "javascript",
              },
              {
                id: "javascript-python",
                source: "javascript",
                target: "python",
              },
            ],
          },
        },
      },
    );
    expect(updateResponse.status()).toBe(200);

    const runResponse = await page.request.post(
      `/api/workspace/workflows/${workflowId}/runs`,
      {
        data: {
          workspaceId,
          input: { value: 20 },
          useLatestDraft: true,
        },
      },
    );
    expect(runResponse.status()).toBe(202);
    const run = (await runResponse.json()) as { run: { id: string } };

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/api/workspace/workflow-runs/${run.run.id}?workspaceId=${workspaceId}`,
          );
          const payload = (await response.json()) as {
            run: {
              status: string;
              error: string | null;
              steps: Array<{
                nodeId: string;
                status: string;
                outputJson: unknown;
              }>;
            };
          };
          return payload.run;
        },
        { timeout: 30_000 },
      )
      .toMatchObject({
        status: "completed",
        error: null,
        steps: [
          { nodeId: "trigger", status: "completed" },
          {
            nodeId: "javascript",
            status: "completed",
            outputJson: { value: 21, javascript: true },
          },
          {
            nodeId: "python",
            status: "completed",
            outputJson: { value: 42, javascript: true, python: true },
          },
        ],
      });
  } finally {
    await page.request.delete(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
  }
});
