import { test } from "@playwright/test";
import { createServer, type Server } from "node:http";

import { ensureE2EUser, login } from "./fixtures";

let upstream: Server;
export let upstreamBaseUrl: string;
export const upstreamBodies: Array<Record<string, unknown>> = [];

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
    { type?: string } | null | undefined;

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
    upstream.listen(
      0,
      process.env.E2E_UPSTREAM_BIND_HOST ?? "127.0.0.1",
      resolve,
    ),
  );
  const address = upstream.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start the E2E OpenAI upstream");
  }
  upstreamBaseUrl = `http://${process.env.E2E_UPSTREAM_HOST ?? "127.0.0.1"}:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    upstream.close((error) => (error ? reject(error) : resolve())),
  );
});

test.beforeEach(async ({ page }) => {
  await login(page);
});
