import nextEnv from "@next/env";
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { databaseUrl, ensureE2EAssistant, login } from "./fixtures";
import { writeStream, usage } from "./workflow-agentic-live.spec.upstream";
nextEnv.loadEnvConfig(process.cwd());

test("sends images and files without inserting an analysis prompt", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { agentId, workspaceId } = await ensureE2EAssistant();
  await login(page);
  await page.request.patch("/api/workspaces", { data: { workspaceId } });
  const upstreamBodies: unknown[] = [];
  const upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    upstreamBodies.push(JSON.parse(Buffer.concat(chunks).toString()));
    writeStream(res, [
      {
        id: "attachment-reply",
        object: "chat.completion.chunk",
        created: 1,
        model: "e2e-model",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Attachment received." },
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
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  const id = randomUUID();
  const previous = (
    await client.query(
      "select base_url, openai_compatible_api_route from ai_providers where id = '10000000-0000-4000-8000-000000000001'",
    )
  ).rows[0];
  try {
    await client.query(
      "update ai_providers set base_url = $1, openai_compatible_api_route = 'chat-completions' where id = '10000000-0000-4000-8000-000000000001'",
      [`http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`],
    );
    await client.query(
      `insert into conversations (id, workspace_id, agent_id, agent_version_id, user_id, title, status, created_at, updated_at) select $1, $2, $3, a.active_version_id, u.id, 'E2E attachment only', 'active', now(), now() from agents a, "user" u where a.id = $3 and u.email = 'e2e-admin@example.test'`,
      [id, workspaceId, agentId],
    );
    await page.goto(`/en/chat?agentId=${agentId}&conversationId=${id}`);
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeEnabled();
    const files = [
      {
        name: "pixel.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      },
      {
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("A document sent without a prompt."),
      },
    ];
    for (const [index, file] of files.entries()) {
      const uploaded = page.waitForResponse((response) =>
        response.url().includes("chat-attachments/upload?phase=complete"),
      );
      const chooser = page.waitForEvent("filechooser");
      await page
        .getByRole("button", { name: "Upload files", exact: true })
        .click();
      await (await chooser).setFiles(file);
      expect((await uploaded).ok()).toBe(true);
      await expect(
        page.getByRole("textbox", { name: "Message", exact: true }),
      ).toHaveValue("");
      const request = page.waitForRequest(
        (request) =>
          request.url().endsWith(`/api/workspace/${agentId}/chat`) &&
          request.method() === "POST",
      );
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      const body = (await request).postDataJSON();
      expect(body.content).toBe("");
      expect([...body.attachmentIds, ...body.imageAttachmentIds]).toHaveLength(
        1,
      );
      await expect(
        page.getByText("Attachment received.", { exact: true }),
      ).toHaveCount(index + 1);
    }
    const regenerated = page.waitForRequest(
      (request) =>
        request.url().endsWith(`/api/workspace/${agentId}/chat`) &&
        request.method() === "POST",
    );
    await page
      .getByRole("button", { name: "Regenerate response", exact: true })
      .last()
      .click();
    const regeneration = (await regenerated).postDataJSON();
    expect(regeneration.content).toBe("");
    expect(regeneration.attachmentIds).toHaveLength(1);
    await expect.poll(() => upstreamBodies.length).toBeGreaterThanOrEqual(3);
    await expect(
      page
        .getByRole("button", { name: "Regenerate response", exact: true })
        .last(),
    ).toBeEnabled();
    const response = await page.request.get(
      `/api/workspace/conversations/${id}`,
    );
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toMatch(/Analyze the|Analyse le|Analyse l’/);
    expect(JSON.stringify(upstreamBodies)).toContain("image_url");
    expect(JSON.stringify(upstreamBodies)).toContain("notes.txt");
    expect(
      (
        await page.request.post(`/api/workspace/${agentId}/chat`, {
          data: { conversationId: id, content: "" },
        })
      ).status(),
    ).toBe(400);
  } finally {
    await client.query("delete from conversations where id = $1", [id]);
    await client.query(
      "update ai_providers set base_url = $1, openai_compatible_api_route = $2 where id = '10000000-0000-4000-8000-000000000001'",
      [previous.base_url, previous.openai_compatible_api_route],
    );
    await client.end();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
