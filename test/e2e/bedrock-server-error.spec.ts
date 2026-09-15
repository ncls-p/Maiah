import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { databaseUrl, ensureE2EAssistant, login } from "./fixtures";
nextEnv.loadEnvConfig(process.cwd());

test("server configuration errors reach the user and remain visible after reload", async ({
  page,
}) => {
  const { agentId, workspaceId } = await ensureE2EAssistant();
  await login(page);
  await page.request.patch("/api/workspaces", { data: { workspaceId } });
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  const id = randomUUID();
  const providerId = "10000000-0000-4000-8000-000000000001";
  const previous = (
    await client.query(
      "select kind, bedrock_config_json from ai_providers where id = $1",
      [providerId],
    )
  ).rows[0];
  try {
    await client.query(
      "update ai_providers set kind = 'amazon-bedrock', bedrock_config_json = null where id = $1",
      [providerId],
    );
    await client.query(
      `insert into conversations (id, workspace_id, agent_id, agent_version_id, user_id, title, status, created_at, updated_at) select $1, $2, $3, a.active_version_id, u.id, 'E2E server diagnostic', 'active', now(), now() from agents a, "user" u where a.id = $3 and u.email = 'e2e-admin@example.test'`,
      [id, workspaceId, agentId],
    );
    const response = await page.request.post(`/api/workspace/${agentId}/chat`, {
      data: { content: "Hello", conversationId: id },
    });
    expect(response.status()).toBe(500);
    const error = await response.json();
    expect(error.code).toBe("BEDROCK_REGION_REQUIRED");
    expect(error.requestId).toBe(response.headers()["x-request-id"]);
    expect(error.error).toContain(error.requestId);
    expect(error).not.toHaveProperty("stack");
    const stored = await client.query(
      "select messages.status, message_parts.type from messages left join message_parts on messages.id = message_parts.message_id where conversation_id = $1",
      [id],
    );
    expect(stored.rows).toContainEqual({ status: "failed", type: "error" });
    await page.goto(`/en/chat?agentId=${agentId}&conversationId=${id}`);
    await expect(
      page.getByText(/BEDROCK_REGION_REQUIRED/).first(),
    ).toBeVisible();
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page
      .getByRole("button", { name: "Copy full error", exact: true })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      error.requestId,
    );
    await page.reload();
    await expect(
      page.getByText(/BEDROCK_REGION_REQUIRED/).first(),
    ).toBeVisible();
  } finally {
    await client.query("delete from conversations where id = $1", [id]);
    await client.query(
      "update ai_providers set kind = $2, bedrock_config_json = $3 where id = $1",
      [providerId, previous.kind, previous.bedrock_config_json],
    );
    await client.end();
  }
});
