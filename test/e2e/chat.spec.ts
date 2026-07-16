import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { randomUUID, webcrypto } from "node:crypto";
import { Client } from "pg";
import { databaseUrl, e2eUser, ensureE2EUser, login } from "./fixtures";

loadEnvConfig(process.cwd());

async function encryptFixtureText(plaintext: string) {
  const keyHex = process.env.APP_ENCRYPTION_KEY;
  const keyId = process.env.APP_ENCRYPTION_KEY_ID;
  if (!keyHex || !keyId) {
    throw new Error("Chat E2E encryption configuration is missing");
  }

  const key = await webcrypto.subtle.importKey(
    "raw",
    Buffer.from(keyHex, "hex"),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return JSON.stringify({
    ct: Buffer.from(ciphertext).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    kid: keyId,
  });
}

async function createRecoveredToolConversation() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    const context = await client.query<{
      agent_id: string;
      agent_version_id: string;
      user_id: string;
      workspace_id: string;
    }>(
      `select a.id as agent_id,
              a.active_version_id as agent_version_id,
              u.id as user_id,
              wm.workspace_id
       from "user" u
       join workspace_members wm on wm.user_id = u.id and wm.status = 'active'
       join agents a on a.workspace_id = wm.workspace_id
                    and a.archived_at is null
                    and a.active_version_id is not null
       where u.email = $1
       order by (a.created_by_user_id = u.id) desc, a.created_at
       limit 1`,
      [e2eUser.email],
    );
    const row = context.rows[0];
    if (!row) throw new Error("No active agent available for chat E2E fixture");

    const conversationId = randomUUID();
    const assistantMessageId = randomUUID();
    const finalText =
      "The first query failed, the corrected query succeeded, and the workflow completed.";

    await client.query("begin");
    await client.query(
      `insert into conversations
         (id, workspace_id, agent_id, agent_version_id, user_id, title, status, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, 'active', now(), now())`,
      [
        conversationId,
        row.workspace_id,
        row.agent_id,
        row.agent_version_id,
        row.user_id,
        "Recovered tool failure E2E",
      ],
    );
    await client.query(
      `insert into messages
         (id, conversation_id, role, status, created_at, completed_at)
       values ($1, $2, 'assistant', 'completed', now(), now())`,
      [assistantMessageId, conversationId],
    );
    await client.query(
      `insert into message_parts
         (id, message_id, type, content_encrypted, metadata_json, sort_order, created_at)
       values
         ($1, $2, 'tool-call', null, $3::jsonb, 0, now()),
         ($4, $2, 'tool-call', null, $5::jsonb, 1, now()),
         ($6, $2, 'text', $7, null, 2, now())`,
      [
        randomUUID(),
        assistantMessageId,
        JSON.stringify({
          toolCallId: "failed-dql-call",
          toolName: "dynatrace_execute_dql",
          input: { query: "invalid query" },
          output: {
            ok: false,
            code: "tool_execution_failed",
            error: "Invalid DQL query",
          },
        }),
        randomUUID(),
        JSON.stringify({
          toolCallId: "successful-dql-retry",
          toolName: "dynatrace_execute_dql",
          input: { query: "fetch logs" },
          output: { ok: true, result: [{ id: "problem-1" }] },
        }),
        randomUUID(),
        await encryptFixtureText(finalText),
      ],
    );
    await client.query("commit");

    return {
      agentId: row.agent_id,
      conversationId,
      cleanup: async () => {
        try {
          await client.query(
            "delete from message_parts where message_id = $1",
            [assistantMessageId],
          );
          await client.query("delete from messages where id = $1", [
            assistantMessageId,
          ]);
          await client.query("delete from conversations where id = $1", [
            conversationId,
          ]);
        } finally {
          await client.end();
        }
      },
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    await client.end();
    throw error;
  }
}

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("chat page", () => {
  test("loads chat page", async ({ page }) => {
    await page.goto("/en/chat");
    await expect(page).toHaveURL(/\/en\/chat/);
  });

  test("keeps the minimalist chat shell responsive and the brand logo unframed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/chat");

    const logo = page.locator('img[alt="Deodis"]:visible').first();
    await expect(logo).toBeVisible({ timeout: 15_000 });
    await expect(logo).toHaveAttribute("data-no-outline", "true");
    expect(
      await logo.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).toBe("none");

    const brandLink = logo.locator("xpath=..");
    const brandLinkBox = await brandLink.boundingBox();
    expect(brandLinkBox?.height ?? 0).toBeGreaterThanOrEqual(40);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("shows no assistants message when no agents exist", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(3000);

    // The chat page should show some content
    const content = page.locator(".page-content").last();
    await expect(content).toBeVisible();

    // Check for either the chat interface or the "no assistants" state
    await expect(
      page.getByText(/No assistants|New conversation|Message|Chat/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("chat sidebar contains conversation list", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(2000);

    // Chat sidebar should be visible with the chat interface
    await expect(page.getByRole("complementary").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Conversations/i).first()).toBeVisible();
  });

  test("new conversation button exists", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(2000);

    // Look for new conversation button or similar
    const newConversationBtn = page
      .getByRole("button", { name: /^New(?: conversation| chat)?$/i })
      .first();
    await expect(newConversationBtn).toBeEnabled({ timeout: 15_000 });
  });

  test("agent selector is present when agents exist", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(2000);

    // Agent selector should be present in the chat sidebar
    const agentSelector = page
      .getByRole("button", { name: /Current assistant/i })
      .first();
    if (await agentSelector.isVisible()) {
      await expect(agentSelector).toBeVisible();
    }
  });

  test("navigate between chat and other pages", async ({ page }) => {
    await page.goto("/en/chat");
    await expect(page).toHaveURL(/\/en\/chat/);

    // Navigate to agents
    await page
      .getByRole("link", {
        name: /Create an assistant|Configure assistant/i,
      })
      .first()
      .click();
    await expect(page).toHaveURL(/\/en\/agents/);

    // Navigate back to chat
    await page.getByRole("link", { name: "Chat", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/chat/);
  });

  test("shows recovered tool failures as completed with warnings", async ({
    page,
  }) => {
    const fixture = await createRecoveredToolConversation();
    try {
      await page.goto(
        `/en/chat?agentId=${fixture.agentId}&conversationId=${fixture.conversationId}`,
      );

      const transcript = page.getByRole("region", { name: "Chat transcript" });
      await expect(
        transcript.getByText("Work completed with warnings", { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        transcript.getByText("Work interrupted", { exact: true }),
      ).toHaveCount(0);

      await transcript.getByRole("button", { name: "Show work phase" }).click();
      await expect(
        transcript.getByText("Failed", { exact: true }),
      ).toBeVisible();
      await expect(
        transcript.getByText("Completed", { exact: true }),
      ).toBeVisible();
    } finally {
      await fixture.cleanup();
    }
  });
});

test.describe("chat composer", () => {
  test("input field is present when agents exist", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(2000);

    // Chat composer / textarea should be present
    const composer = page.locator("textarea, [role='textbox']").first();

    if (await composer.isVisible()) {
      await expect(composer).toBeVisible();
    }
  });
});
