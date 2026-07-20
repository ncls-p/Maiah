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

    const firstRunResponse = await execute();
    expect(firstRunResponse.status()).toBe(202);
    const firstRun = (await firstRunResponse.json()) as {
      run: { id: string; status: string };
    };
    expect(firstRun.run.status).toBe("queued");

    const duplicateRunResponse = await execute();
    expect(duplicateRunResponse.status()).toBe(202);
    const duplicateRun = (await duplicateRunResponse.json()) as {
      run: { id: string };
    };
    expect(duplicateRun.run.id).toBe(firstRun.run.id);

    const runsResponse = await page.request.get(
      `/api/workspace/workflows/${workflowId}/runs?workspaceId=${workspaceId}`,
      { headers: bearerHeaders },
    );
    expect(runsResponse.status()).toBe(200);
    const runs = (await runsResponse.json()) as {
      runs: Array<{ id: string }>;
    };
    expect(runs.runs.some(({ id }) => id === firstRun.run.id)).toBeTruthy();
  } finally {
    await page.request.delete(
      `/api/workspace/api-keys/${createdKey.apiKey.id}?workspaceId=${workspaceId}`,
    );
    await page.request.delete(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
  }
});
