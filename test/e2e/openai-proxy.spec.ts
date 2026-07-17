import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { expect, test } from "@playwright/test";

import { ensureE2EUser, login } from "./fixtures";

let upstream: Server;
let upstreamBaseUrl: string;
const upstreamBodies: Array<Record<string, unknown>> = [];

function upstreamUsage() {
  return {
    prompt_tokens: 8,
    completion_tokens: 4,
    total_tokens: 12,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 0 },
  };
}

function completionPayload(body: Record<string, unknown>) {
  const model = typeof body.model === "string" ? body.model : "proxy-model";
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const responseFormat = body.response_format as
    | { type?: string }
    | null
    | undefined;

  if (tools.length > 0) {
    return {
      id: "chatcmpl-upstream-tool",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_e2e_weather",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"city":"Paris"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: upstreamUsage(),
    };
  }

  return {
    id: "chatcmpl-upstream-text",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content:
            responseFormat?.type === "json_schema" ||
            responseFormat?.type === "json_object"
              ? '{"answer":"proxy-ok"}'
              : "proxy-ok",
        },
        finish_reason: "stop",
      },
    ],
    usage: upstreamUsage(),
  };
}

async function readBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

test.beforeAll(async () => {
  await ensureE2EUser();
  upstream = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/models") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "proxy-model", object: "model", owned_by: "e2e" }],
        }),
      );
      return;
    }
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.statusCode = 404;
      response.end();
      return;
    }

    const body = await readBody(request);
    upstreamBodies.push(body);
    if (body.stream === true) {
      const model = String(body.model);
      const created = Math.floor(Date.now() / 1000);
      const chunks = [
        {
          id: "chatcmpl-upstream-stream",
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "" },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-upstream-stream",
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            { index: 0, delta: { content: "proxy" }, finish_reason: null },
          ],
        },
        {
          id: "chatcmpl-upstream-stream",
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            { index: 0, delta: { content: "-stream" }, finish_reason: null },
          ],
        },
        {
          id: "chatcmpl-upstream-stream",
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: upstreamUsage(),
        },
      ];
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      });
      for (const chunk of chunks)
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      response.end("data: [DONE]\n\n");
      return;
    }

    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(completionPayload(body)));
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, "127.0.0.1", resolve),
  );
  const address = upstream.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start the E2E OpenAI upstream");
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

test("official OpenAI SDK uses Maiah as a scoped model proxy end to end", async ({
  page,
}) => {
  const workspacesResponse = await page.request.get("/api/workspaces");
  expect(workspacesResponse.ok()).toBe(true);
  const workspaces = (await workspacesResponse.json()) as Array<{
    workspace: { id: string };
  }>;
  const workspaceId = workspaces[0]?.workspace.id;
  if (!workspaceId) throw new Error("E2E workspace is missing");

  const modelName = `proxy-e2e-${Date.now()}`;
  let providerId: string | undefined;
  let tokenId: string | undefined;
  try {
    const providerResponse = await page.request.post(
      "/api/workspace/providers",
      {
        data: {
          workspaceId,
          kind: "openai-compatible",
          name: "OpenAI proxy E2E upstream",
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
          modelId: modelName,
          displayName: "Proxy E2E model",
          capabilitiesJson: { text: true, tools: true, vision: true },
          contextWindow: 32_000,
          maxOutputTokens: 4_096,
        },
      },
    );
    expect(modelResponse.status()).toBe(201);

    const tokenResponse = await page.request.post("/api/workspace/api-keys", {
      data: {
        workspaceId,
        name: `OpenAI proxy E2E ${Date.now()}`,
        scopes: ["models.view", "models.invoke"],
      },
    });
    expect(tokenResponse.status()).toBe(201);
    const token = (await tokenResponse.json()) as {
      rawKey: string;
      apiKey: { id: string };
    };
    tokenId = token.apiKey.id;

    const appBaseUrl =
      process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const client = new OpenAI({
      apiKey: token.rawKey,
      baseURL: `${appBaseUrl}/api/v1`,
      maxRetries: 0,
    });

    const models = await client.models.list();
    expect(models.data.map((model) => model.id)).toContain(modelName);
    const retrieved = await client.models.retrieve(modelName);
    expect(retrieved.id).toBe(modelName);

    const chat = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: "Say proxy-ok" }],
      user: "openai-sdk-e2e",
      parallel_tool_calls: false,
    });
    expect(chat.choices[0]?.message.content).toBe("proxy-ok");
    expect(chat.usage?.total_tokens).toBe(12);
    expect(upstreamBodies).toContainEqual(
      expect.objectContaining({
        user: "openai-sdk-e2e",
        parallel_tool_calls: false,
      }),
    );

    const structured = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: "Return JSON" }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "answer",
          strict: true,
          schema: {
            type: "object",
            properties: { answer: { type: "string" } },
            required: ["answer"],
            additionalProperties: false,
          },
        },
      },
    });
    expect(JSON.parse(structured.choices[0]?.message.content ?? "{}")).toEqual({
      answer: "proxy-ok",
    });

    const toolCall = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: "Weather in Paris?" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        },
      ],
    });
    expect(toolCall.choices[0]?.finish_reason).toBe("tool_calls");
    const firstToolCall = toolCall.choices[0]?.message.tool_calls?.[0];
    expect(firstToolCall?.type).toBe("function");
    if (firstToolCall?.type !== "function") {
      throw new Error("Expected a function tool call");
    }
    expect(firstToolCall.function.name).toBe("get_weather");

    const response = await client.responses.create({
      model: modelName,
      input: "Say proxy-ok",
    });
    expect(response.output_text).toBe("proxy-ok");
    expect(response.usage?.total_tokens).toBe(12);

    const chatStream = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: "Stream" }],
      stream: true,
      stream_options: { include_usage: true },
    });
    let chatText = "";
    let streamedUsage: number | undefined;
    for await (const event of chatStream) {
      chatText += event.choices[0]?.delta.content ?? "";
      streamedUsage = event.usage?.total_tokens ?? streamedUsage;
    }
    expect(chatText).toBe("proxy-stream");
    expect(streamedUsage).toBe(12);

    const responseStream = await client.responses.create({
      model: modelName,
      input: "Stream",
      stream: true,
    });
    let responseText = "";
    let completed = false;
    for await (const event of responseStream) {
      if (event.type === "response.output_text.delta") {
        responseText += event.delta;
      }
      if (event.type === "response.completed") completed = true;
    }
    expect(responseText).toBe("proxy-stream");
    expect(completed).toBe(true);
  } finally {
    if (tokenId) {
      await page.request.delete(
        `/api/workspace/api-keys/${tokenId}?workspaceId=${workspaceId}`,
      );
    }
    if (providerId) {
      await page.request.delete(
        `/api/workspace/providers/${providerId}?workspaceId=${workspaceId}`,
      );
    }
  }
});

test("proxy enforces authentication, invocation scope and model visibility", async ({
  page,
}) => {
  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string } }>;
  const workspaceId = workspaces[0]?.workspace.id;
  if (!workspaceId) throw new Error("E2E workspace is missing");

  const readOnlyResponse = await page.request.post("/api/workspace/api-keys", {
    data: {
      workspaceId,
      name: `OpenAI proxy read-only ${Date.now()}`,
      scopes: ["models.view"],
    },
  });
  expect(readOnlyResponse.status()).toBe(201);
  const token = (await readOnlyResponse.json()) as {
    rawKey: string;
    apiKey: { id: string };
  };

  try {
    const appBaseUrl =
      process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const readOnlyClient = new OpenAI({
      apiKey: token.rawKey,
      baseURL: `${appBaseUrl}/api/v1`,
      maxRetries: 0,
    });
    await expect(readOnlyClient.models.list()).resolves.toBeDefined();
    await expect(
      readOnlyClient.chat.completions.create({
        model: "not-visible",
        messages: [{ role: "user", content: "Denied before model lookup" }],
      }),
    ).rejects.toMatchObject({ status: 403, code: "insufficient_permissions" });

    const invalidClient = new OpenAI({
      apiKey: "ahub_invalid",
      baseURL: `${appBaseUrl}/api/v1`,
      maxRetries: 0,
    });
    await expect(invalidClient.models.list()).rejects.toMatchObject({
      status: 401,
      code: "invalid_api_key",
    });
  } finally {
    await page.request.delete(
      `/api/workspace/api-keys/${token.apiKey.id}?workspaceId=${workspaceId}`,
    );
  }
});
