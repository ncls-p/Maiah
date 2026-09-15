import { createServer } from "node:http";
import { writeStream, usage } from "./workflow-agentic-live.spec.upstream";
import nextEnv from "@next/env";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { databaseUrl, ensureE2EAssistant, login } from "./fixtures";
nextEnv.loadEnvConfig(process.cwd());

test("custom form validates choices, retains failed answers and sends them in the same chat", async ({
  page,
}) => {
  const { agentId, workspaceId } = await ensureE2EAssistant();
  await login(page);
  await page.request.patch("/api/workspaces", { data: { workspaceId } });
  test.setTimeout(60_000);
  const upstream = createServer(async (request, response) => {
    for await (const chunk of request) void chunk;
    writeStream(response, [
      {
        id: "form-reply",
        object: "chat.completion.chunk",
        created: 1,
        model: "e2e-chat",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Your project is ready." },
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
  const upstreamAddress = upstream.address() as { port: number };
  const conversationId = randomUUID();
  const messageId = randomUUID();
  const output = {
    kind: "question_form",
    version: 1,
    id: randomUUID(),
    conversationId,
    form: {
      title: "Prepare my project",
      description: "Tell me what you need.",
      questions: [
        { id: "name", label: "Project name", type: "text", required: true },
        {
          id: "features",
          label: "Features",
          type: "multiple-choice",
          required: true,
          options: [
            { value: "search", label: "Search" },
            { value: "images", label: "Images" },
          ],
        },
        { id: "size", label: "Team size", type: "number", required: false },
        { id: "notes", label: "Notes", type: "textarea", required: false },
        { id: "date", label: "Start date", type: "date", required: false },
        {
          id: "priority",
          label: "Priority",
          type: "single-choice",
          required: true,
          options: [
            { value: "speed", label: "Speed" },
            { value: "quality", label: "Quality" },
          ],
        },
      ],
    },
  };
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  const previous = await client.query(
    "select base_url, openai_compatible_api_route from ai_providers where id = '10000000-0000-4000-8000-000000000001'",
  );
  await client.query(
    "update ai_providers set base_url = $1, openai_compatible_api_route = 'chat-completions' where id = '10000000-0000-4000-8000-000000000001'",
    [`http://127.0.0.1:${upstreamAddress.port}/v1`],
  );
  try {
    await client.query(
      `insert into conversations (id, workspace_id, agent_id, agent_version_id, user_id, title, status, created_at, updated_at) select $1, $2, $3, a.active_version_id, u.id, 'E2E question form', 'active', now(), now() from agents a, "user" u where a.id = $3 and u.email = 'e2e-admin@example.test'`,
      [conversationId, workspaceId, agentId],
    );
    await client.query(
      `insert into messages (id, conversation_id, role, status, completed_at, created_at) values ($1, $2, 'assistant', 'completed', now(), now())`,
      [messageId, conversationId],
    );
    for (const [index, type] of ["tool-call", "tool-result"].entries())
      await client.query(
        `insert into message_parts (message_id, type, metadata_json, sort_order) values ($1, $2, $3::jsonb, $4)`,
        [
          messageId,
          type,
          JSON.stringify({
            toolCallId: "question-call",
            toolName: "ask_question_form",
            ...(type === "tool-result" ? { output } : { input: output.form }),
          }),
          index,
        ],
      );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/en/chat?agentId=${agentId}&conversationId=${conversationId}`,
    );
    const form = page.getByRole("form", { name: "Prepare my project" });
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: "Send answers" }).click();
    await expect(
      form.getByLabel("Project name", { exact: false }),
    ).toBeFocused();
    await form.getByLabel("Project name", { exact: false }).fill("Atlas");
    await form.getByLabel("Search", { exact: true }).check();
    await form.getByLabel("Quality", { exact: true }).check();
    await form.getByLabel("Team size", { exact: false }).fill("5");
    await form.getByLabel("Notes", { exact: true }).fill("A clear interface");
    await form.getByLabel("Start date", { exact: true }).fill("2026-10-01");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    let requestBody: Record<string, unknown> | undefined;
    await page.route(`**/api/workspace/${agentId}/chat`, async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({ status: 503, json: { error: "FORM_TEST_RETRY" } });
    });
    await form.getByRole("button", { name: "Send answers" }).click();
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(form.getByLabel("Project name", { exact: false })).toHaveValue(
      "Atlas",
    );
    expect(JSON.stringify(requestBody)).toContain("Features: Search");
    expect(JSON.stringify(requestBody)).toContain("Priority: Quality");
    expect(JSON.stringify(requestBody)).toContain(conversationId);
    await page.unroute(`**/api/workspace/${agentId}/chat`);
    await form.getByRole("button", { name: "Send answers" }).click();
    await expect(form.getByText("Answers sent", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const persisted = await client.query(
      `select content_encrypted from message_parts join messages on messages.id = message_parts.message_id where conversation_id = $1 and role = 'user' and type = 'text'`,
      [conversationId],
    );
    expect(persisted.rows.length).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByText(/Project name: Atlas/).first()).toBeVisible();
  } finally {
    await client.query("delete from conversations where id = $1", [
      conversationId,
    ]);
    await client.query(
      "update ai_providers set base_url = $1, openai_compatible_api_route = $2 where id = '10000000-0000-4000-8000-000000000001'",
      [previous.rows[0].base_url, previous.rows[0].openai_compatible_api_route],
    );
    await client.end();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
