import { createServer, type IncomingMessage, type Server } from "node:http";

import { expect, test } from "@playwright/test";

import { ensureE2EUser, login } from "./fixtures";

let upstream: Server;
let upstreamBaseUrl: string;

const generatedDefinition = {
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
      id: "summary",
      type: "data.template",
      label: "Prepare summary",
      position: { x: 380, y: 180 },
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
  ],
  edges: [
    {
      id: "edge-trigger-summary",
      source: "trigger",
      target: "summary",
      sourceHandle: null,
    },
  ],
};

function usage() {
  return {
    prompt_tokens: 24,
    completion_tokens: 12,
    total_tokens: 36,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 0 },
  };
}

async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    model?: string;
    messages?: Array<{ role?: string }>;
  };
}

function writeStream(
  response: import("node:http").ServerResponse,
  chunks: unknown[],
) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
  });
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  response.end("data: [DONE]\n\n");
}

test.beforeAll(async () => {
  await ensureE2EUser();
  upstream = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.statusCode = 404;
      response.end();
      return;
    }

    const body = await requestBody(request);
    const model = body.model ?? "workflow-agentic-e2e";
    const created = Math.floor(Date.now() / 1_000);
    const hasToolResult = body.messages?.some(
      (message) => message.role === "tool",
    );

    if (hasToolResult) {
      writeStream(response, [
        {
          id: "chatcmpl-agentic-text",
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: "The summary workflow is ready.",
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-agentic-text",
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: usage(),
        },
      ]);
      return;
    }

    writeStream(response, [
      {
        id: "chatcmpl-agentic-tool",
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "call_replace_workflow",
                  type: "function",
                  function: {
                    name: "replace_workflow",
                    arguments: JSON.stringify({
                      summary: "Added a summary step",
                      definition: generatedDefinition,
                    }),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: "chatcmpl-agentic-tool",
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        usage: usage(),
      },
    ]);
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, "127.0.0.1", resolve),
  );
  const address = upstream.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start the workflow agentic E2E upstream");
  }
  upstreamBaseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    upstream.close((error) => (error ? reject(error) : resolve())),
  );
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("builds, saves, and runs a workflow through the real agentic provider stream", async ({
  page,
}) => {
  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string } }>;
  const workspaceId = workspaces[0]!.workspace.id;
  const previousBuilderState = (await (
    await page.request.get(
      `/api/admin/workflow-builder?workspaceId=${workspaceId}`,
    )
  ).json()) as { config: { agentId: string | null } };

  let providerId: string | undefined;
  let agentId: string | undefined;
  let workflowId: string | undefined;

  try {
    const providerResponse = await page.request.post(
      "/api/workspace/providers",
      {
        data: {
          workspaceId,
          kind: "openai-compatible",
          name: "Workflow agentic E2E upstream",
          baseUrl: `${upstreamBaseUrl}/v1`,
          authType: "custom-header",
          openaiCompatibleApiRoute: "chat-completions",
        },
      },
    );
    expect(providerResponse.status()).toBe(201);
    providerId = ((await providerResponse.json()) as { id: string }).id;

    const modelResponse = await page.request.post(
      `/api/workspace/providers/${providerId}/models`,
      {
        data: {
          workspaceId,
          modelId: `workflow-agentic-e2e-${Date.now()}`,
          displayName: "Workflow agentic E2E model",
          capabilitiesJson: { text: true, tools: true },
          contextWindow: 32_000,
          maxOutputTokens: 4_096,
        },
      },
    );
    expect(modelResponse.status()).toBe(201);
    const modelId = ((await modelResponse.json()) as { id: string }).id;

    const agentResponse = await page.request.post("/api/workspace/agents", {
      data: {
        workspaceId,
        name: "Workflow builder E2E",
        slug: `workflow-builder-e2e-${Date.now()}`,
        systemPrompt: "Build deterministic workflow fixtures.",
        providerId,
        modelId,
        maxOutputTokens: 4_096,
      },
    });
    expect(agentResponse.status()).toBe(201);
    agentId = (
      (await agentResponse.json()) as {
        agent: { id: string };
      }
    ).agent.id;

    const builderSettingsResponse = await page.request.patch(
      "/api/admin/workflow-builder",
      {
        data: {
          workspaceId,
          agentId,
        },
      },
    );
    expect(builderSettingsResponse.ok()).toBe(true);

    const workflowResponse = await page.request.post(
      "/api/workspace/workflows",
      {
        data: {
          workspaceId,
          name: `Agentic live E2E ${Date.now()}`,
        },
      },
    );
    expect(workflowResponse.status()).toBe(201);
    workflowId = (
      (await workflowResponse.json()) as {
        workflow: { id: string };
      }
    ).workflow.id;

    await page.goto(`/en/workflows/${workflowId}`);
    await page.getByRole("button", { name: "Agentic" }).click();
    await page
      .getByRole("textbox", {
        name: /When a request arrives, have an assistant analyze it/i,
      })
      .fill("Build a summary workflow");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Using Workflow builder E2E")).toBeVisible();
    await expect(page.getByText("Building the workflow")).toBeVisible();
    await expect(
      page.getByText("The summary workflow is ready."),
    ).toBeVisible();
    await expect(
      page.getByText("Prepare summary", { exact: true }),
    ).toBeVisible();

    const persisted = (await (
      await page.request.get(
        `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
      )
    ).json()) as {
      workflow: {
        latestVersion: number;
        definition: typeof generatedDefinition;
      };
    };
    expect(persisted.workflow.latestVersion).toBe(2);
    expect(
      persisted.workflow.definition.nodes.some((node) => node.id === "summary"),
    ).toBe(true);

    const runResponse = await page.request.post(
      `/api/workspace/workflows/${workflowId}/runs`,
      {
        data: {
          workspaceId,
          input: { message: "Bonjour" },
          useLatestDraft: true,
        },
      },
    );
    expect(runResponse.status()).toBe(202);
    const runId = (
      (await runResponse.json()) as {
        run: { id: string };
      }
    ).run.id;

    await expect
      .poll(
        async () => {
          const detailResponse = await page.request.get(
            `/api/workspace/workflow-runs/${runId}?workspaceId=${workspaceId}`,
          );
          expect(detailResponse.status()).toBe(200);
          return (
            (await detailResponse.json()) as {
              run: {
                status: string;
                steps: Array<{ status: string }>;
              };
            }
          ).run;
        },
        { timeout: 15_000 },
      )
      .toMatchObject({
        status: "completed",
        steps: [{ status: "completed" }, { status: "completed" }],
      });
  } finally {
    await page.request.patch("/api/admin/workflow-builder", {
      data: {
        workspaceId,
        agentId: previousBuilderState.config.agentId,
      },
    });
    if (workflowId) {
      await page.request.delete(
        `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
      );
    }
    if (agentId) {
      await page.request.delete(
        `/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`,
      );
    }
    if (providerId) {
      await page.request.delete(
        `/api/workspace/providers/${providerId}?workspaceId=${workspaceId}`,
      );
    }
  }
});
