import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { Client } from "pg";
import { databaseUrl, ensureE2EAssistant, login } from "./fixtures";
import { writeStream, usage } from "./workflow-agentic-live.spec.upstream";

test("unsupported sampling settings self-correct and remain excluded on the next chat", async ({
  page,
}) => {
  const { workspaceId } = await ensureE2EAssistant();
  await login(page);
  const requests: Record<string, unknown>[] = [];
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const param =
      body.temperature !== undefined
        ? "temperature"
        : body.top_p !== undefined
          ? "top_p"
          : null;
    if (param) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          error: {
            param,
            code: "unsupported_parameter",
            message: `Unsupported parameter: '${param}' is not supported with this model.`,
          },
        }),
      );
      return;
    }
    writeStream(response, [
      {
        id: "compatible",
        object: "chat.completion.chunk",
        created: 1,
        model: "e2e-model",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Compatible reply." },
            finish_reason: "stop",
          },
        ],
        usage: usage(),
      },
    ]);
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, "127.0.0.1", resolve),
  );
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  const providerId = "10000000-0000-4000-8000-000000000001";
  const previous = (
    await db.query(
      "select base_url, openai_compatible_api_route from ai_providers where id = $1",
      [providerId],
    )
  ).rows[0];
  let agentId: string | undefined;
  let versionId: string | undefined;
  try {
    await db.query(
      "update ai_providers set base_url = $1, openai_compatible_api_route = 'chat-completions' where id = $2",
      [
        `http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`,
        providerId,
      ],
    );
    const created = await page.request.post("/api/workspace/agents", {
      data: {
        workspaceId,
        name: "E2E generation compatibility",
        providerId,
        modelId: "10000000-0000-4000-8000-000000000002",
        systemPrompt: "Reply briefly.",
        temperature: "0.4",
        topP: "0.8",
        toolBindings: [],
        generationSettings: { seed: 42, presencePenalty: 0.2 },
      },
    });
    expect(created.status()).toBe(201);
    const payload = await created.json();
    agentId = payload.agent.id;
    versionId = payload.agent.activeVersionId;
    const first = await page.request.post(`/api/workspace/${agentId}/chat`, {
      data: { content: "Compatibility first turn" },
    });
    expect(first.ok()).toBe(true);
    const output = await first.text();
    expect(output).toContain("Compatible reply.");
    expect(
      requests.slice(0, 3).map((body) => [body.temperature, body.top_p]),
    ).toEqual([
      [0.4, 0.8],
      [undefined, 0.8],
      [undefined, undefined],
    ]);
    expect(requests[2].seed).toBe(42);
    expect(requests[2].presence_penalty).toBe(0.2);
    const version = await (
      await page.request.get(
        `/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}&versionId=${versionId}`,
      )
    ).json();
    expect(version.excludedGenerationSettings.sort()).toEqual([
      "temperature",
      "topP",
    ]);
    expect(version.temperature).toBe("0.4");
    const previousCount = requests.length;
    const second = await page.request.post(`/api/workspace/${agentId}/chat`, {
      data: { content: "Compatibility second turn" },
    });
    expect(await second.text()).toContain("Compatible reply.");
    expect(requests[previousCount].temperature).toBeUndefined();
    expect(requests[previousCount].top_p).toBeUndefined();
  } finally {
    if (agentId) {
      await db.query("delete from conversations where agent_id = $1", [
        agentId,
      ]);
      await page.request.delete(
        `/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`,
      );
    }
    if (versionId)
      await db.query("delete from app_settings where key like $1", [
        `generation:${versionId}:%`,
      ]);
    await db.query(
      "update ai_providers set base_url = $1, openai_compatible_api_route = $2 where id = $3",
      [previous.base_url, previous.openai_compatible_api_route, providerId],
    );
    await db.end();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
