import { createServer } from "node:http";

import { test } from "@playwright/test";

import { ensureE2EUser, login } from "./fixtures";
import {
  generatedDefinition,
  requestBody,
  upstreamState,
  usage,
  writeStream,
  writeToolCall,
} from "./workflow-agentic-live.spec.upstream";

test.beforeAll(async () => {
  await ensureE2EUser();
  upstreamState.server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.statusCode = 404;
      response.end();
      return;
    }

    const body = await requestBody(request);
    const model = body.model ?? "workflow-agentic-e2e";
    const created = Math.floor(Date.now() / 1_000);
    const calledTools = new Set(
      body.messages
        ?.flatMap((message) => message.tool_calls ?? [])
        .map((call) => call.function?.name)
        .filter((name): name is string => Boolean(name)) ?? [],
    );

    if (!calledTools.has("set_workflow_plan")) {
      writeToolCall(response, {
        created,
        model,
        id: "call_plan",
        name: "set_workflow_plan",
        arguments: {
          summary: "Build and verify a summary workflow",
          steps: ["Build the workflow", "Validate the workflow"],
          tests: ["Dry-run the workflow with a sample message"],
        },
      });
      return;
    }
    if (!calledTools.has("update_todo_list")) {
      writeToolCall(response, {
        created,
        model,
        id: "call_todos",
        name: "update_todo_list",
        arguments: {
          title: "Summary workflow",
          items: [
            {
              id: "build",
              label: "Build the workflow",
              status: "in_progress",
            },
            {
              id: "test",
              label: "Validate and dry-run the workflow",
              status: "pending",
            },
          ],
        },
      });
      return;
    }
    if (!calledTools.has("upsert_workflow_nodes")) {
      writeToolCall(response, {
        created,
        model,
        id: "call_upsert_nodes",
        name: "upsert_workflow_nodes",
        arguments: {
          summary: "Added a summary step",
          nodes: generatedDefinition.nodes.filter(
            (node) => node.id === "summary",
          ),
        },
      });
      return;
    }
    if (!calledTools.has("connect_workflow_nodes")) {
      writeToolCall(response, {
        created,
        model,
        id: "call_connect_nodes",
        name: "connect_workflow_nodes",
        arguments: {
          connections: [
            {
              source: "trigger",
              target: "summary",
            },
          ],
        },
      });
      return;
    }
    if (!calledTools.has("validate_workflow")) {
      writeToolCall(response, {
        created,
        model,
        id: "call_validate",
        name: "validate_workflow",
        arguments: {},
      });
      return;
    }
    if (!calledTools.has("dry_run_workflow")) {
      writeToolCall(response, {
        created,
        model,
        id: "call_dry_run",
        name: "dry_run_workflow",
        arguments: { testInput: { message: "Bonjour" } },
      });
      return;
    }

    {
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
  });
  await new Promise<void>((resolve) =>
    upstreamState.server?.listen(
      0,
      process.env.E2E_UPSTREAM_BIND_HOST ?? "127.0.0.1",
      resolve,
    ),
  );
  const address = upstreamState.server?.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start the workflow agentic E2E upstream");
  }
  upstreamState.baseUrl = `http://${process.env.E2E_UPSTREAM_HOST ?? "127.0.0.1"}:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    upstreamState.server?.close((error) => (error ? reject(error) : resolve())),
  );
});

test.beforeEach(async ({ page }) => {
  await login(page);
});
