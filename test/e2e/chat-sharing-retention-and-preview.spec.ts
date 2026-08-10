import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

import {
  activate,
  databaseUrl,
  e2eMember,
  ensureE2EAssistant,
  ensureE2EMember,
  ensureE2EUser,
  login,
} from "./fixtures";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

async function createConversation(isEphemeral = false) {
  const { agentId, workspaceId } = await ensureE2EAssistant();
  const id = randomUUID();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(
      `insert into conversations
       (id, workspace_id, agent_id, agent_version_id, user_id, title, status,
        is_ephemeral, ephemeral_ttl_minutes, expires_at, created_at, updated_at)
       select $1, $2, $3, a.active_version_id, u.id, $4, 'active', $5, 1440,
              case when $5 then now() + interval '24 hours' else null end,
              now(), now()
       from agents a, "user" u
       where a.id = $3 and u.email = 'e2e-admin@example.test'`,
      [id, workspaceId, agentId, `E2E sharing ${id.slice(0, 8)}`, isEphemeral],
    );
    return { id, agentId };
  } finally {
    await client.end();
  }
}

async function deleteConversation(id: string) {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("delete from conversations where id = $1", [id]);
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  await ensureE2EUser();
  await ensureE2EMember();
  await ensureE2EAssistant();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("starts a temporary chat from the compact sidebar timer with every retention choice", async ({
  page,
}) => {
  await page.goto("/en/chat");
  const temporaryButton = page.getByRole("button", {
    name: "New temporary conversation",
  });
  await expect(temporaryButton).toBeVisible({ timeout: 15_000 });
  await activate(temporaryButton);
  for (const label of [
    "After 5 minutes",
    "After 12 hours",
    "After 24 hours",
    "After 2 days",
    "After 1 week",
  ]) {
    await expect(page.getByRole("menuitem", { name: label })).toBeVisible();
  }
  await activate(page.getByRole("menuitem", { name: "After 24 hours" }));
  await expect(page).toHaveURL(/\/en\/chat\?temporary=true&ttl=1440$/);
  await expect(
    page.getByRole("combobox", { name: "Delete after inactivity" }),
  ).toHaveCount(0);
});

test("does not impose browser-side upper limits on generation values", async ({
  page,
}) => {
  const { agentId } = await ensureE2EAssistant();
  await page.goto(`/en/agents/${agentId}`);
  await activate(
    page
      .getByRole("main")
      .getByRole("button", { name: /^Advanced Technical ID/ }),
  );
  const maxToolCalls = page.locator("#agent-max-tool-calls");
  await expect(maxToolCalls).toBeVisible({ timeout: 15_000 });
  await expect(maxToolCalls).not.toHaveAttribute("max", /.+/);
  await maxToolCalls.fill("100");
  await expect(maxToolCalls).toHaveValue("100");
  expect(
    await maxToolCalls.evaluate((element) =>
      (element as HTMLInputElement).checkValidity(),
    ),
  ).toBe(true);
});

test("hides an assistant from the chat selector after SPA navigation", async ({
  page,
}) => {
  await page.goto("/en/agents");
  const actions = page.getByRole("button", {
    name: "More actions for E2E menu assistant",
  });
  await expect(actions).toBeVisible({ timeout: 15_000 });
  await activate(actions);
  const hideAction = page.getByRole("menuitem", {
    name: "Hide from chat selector",
  });
  const wasVisible = await hideAction.isVisible();

  try {
    if (wasVisible) await activate(hideAction);
    await activate(page.getByRole("link", { name: "Chat", exact: true }));
    await expect(page).toHaveURL(/\/en\/chat/);
    const assistantSelector = page.getByRole("button", {
      name: "Current assistant",
    });
    const emptyAssistantState = page.getByText("No assistants yet");
    await expect(assistantSelector.or(emptyAssistantState)).toBeVisible({
      timeout: 15_000,
    });
    if (await assistantSelector.count()) {
      await activate(assistantSelector);
      await expect(
        page.getByRole("menuitem", { name: /E2E menu assistant/ }),
      ).toHaveCount(0);
    } else {
      await expect(emptyAssistantState).toBeVisible();
      await expect(page.getByText("E2E menu assistant")).toHaveCount(0);
    }
    await expect(page.getByRole("complementary")).toBeVisible();
  } finally {
    await ensureE2EAssistant();
  }
});

test("creates a temporary chat with the retention selected from the timer", async ({
  page,
}) => {
  await ensureE2EAssistant();
  const title = `Temporary retention ${randomUUID()}`;
  let conversationId: string | undefined;
  try {
    await page.goto("/en/chat");
    await expect(
      page.getByRole("button", { name: "Current assistant" }),
    ).toBeVisible({ timeout: 15_000 });
    await activate(page.getByRole("button", { name: "Current assistant" }));
    await activate(page.getByRole("menuitem", { name: /E2E menu assistant/ }));
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeEnabled();
    await activate(
      page.getByRole("button", { name: "New temporary conversation" }),
    );
    await activate(page.getByRole("menuitem", { name: "After 5 minutes" }));
    await expect(page).toHaveURL(/\/en\/chat\?temporary=true&ttl=5$/);
    await expect(
      page.getByRole("button", { name: "Show temporary conversation details" }),
    ).toBeVisible();
    await expect(
      page.getByText("Timer starts after first message", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save permanently" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill(title);
    await activate(page.getByRole("button", { name: "Send message" }));
    await expect(
      page.getByRole("button", { name: "Stop generation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send message" }),
    ).toHaveCount(0);

    await expect
      .poll(async () => {
        const client = new Client({ connectionString: databaseUrl() });
        await client.connect();
        try {
          const result = await client.query<{
            id: string;
            ttl: number;
            seconds: number;
          }>(
            `select ephemeral_ttl_minutes as ttl,
                    id,
                    extract(epoch from (expires_at - updated_at))::int as seconds
             from conversations where title = $1 and is_ephemeral = true`,
            [title],
          );
          conversationId = result.rows[0]?.id;
          return result.rows[0];
        } finally {
          await client.end();
        }
      })
      .toMatchObject({ ttl: 5, seconds: 300 });

    await expect(page.getByText(/^Deletes in /)).toBeVisible();
    await activate(
      page.getByRole("button", { name: "Show temporary conversation details" }),
    );
    await expect(page.getByText(/^Scheduled for /)).toBeVisible();
    await activate(page.getByRole("button", { name: "Extend" }));
    await activate(page.getByRole("menuitem", { name: "After 12 hours" }));
    await expect(page.getByText(/^Deletes in 11h /)).toBeVisible();
    await expect(page).toHaveURL(/temporary=true&ttl=720/);
    await expect
      .poll(async () => {
        const client = new Client({ connectionString: databaseUrl() });
        await client.connect();
        try {
          const result = await client.query<{ ttl: number; seconds: number }>(
            `select ephemeral_ttl_minutes as ttl,
                    extract(epoch from (expires_at - updated_at))::int as seconds
             from conversations where id = $1`,
            [conversationId],
          );
          return result.rows[0];
        } finally {
          await client.end();
        }
      })
      .toEqual({ ttl: 720, seconds: 43_200 });
    await activate(page.getByRole("button", { name: "Save permanently" }));
    await expect(
      page.getByRole("button", { name: "Show temporary conversation details" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Saved conversation", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const client = new Client({ connectionString: databaseUrl() });
        await client.connect();
        try {
          const result = await client.query<{
            isEphemeral: boolean;
            expiresAt: Date | null;
          }>(
            `select is_ephemeral as "isEphemeral", expires_at as "expiresAt"
             from conversations where id = $1`,
            [conversationId],
          );
          return result.rows[0];
        } finally {
          await client.end();
        }
      })
      .toEqual({ isEphemeral: false, expiresAt: null });
  } finally {
    if (conversationId) await deleteConversation(conversationId);
  }
});

test("physically purges expired temporary chats and their persisted activity", async () => {
  const { agentId, workspaceId } = await ensureE2EAssistant();
  const conversationId = randomUUID();
  const messageId = randomUUID();
  const invocationId = randomUUID();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(
      `insert into conversations
       (id, workspace_id, agent_id, agent_version_id, user_id, title, status,
        is_ephemeral, ephemeral_ttl_minutes, expires_at, created_at, updated_at)
       select $1, $2, $3, a.active_version_id, u.id, $4, 'active', true, 5,
              now() - interval '1 minute', now() - interval '10 minutes', now() - interval '6 minutes'
       from agents a, "user" u
       where a.id = $3 and u.email = 'e2e-admin@example.test'`,
      [
        conversationId,
        workspaceId,
        agentId,
        `Expired E2E ${conversationId.slice(0, 8)}`,
      ],
    );
    await client.query(
      `insert into messages (id, conversation_id, role, status, created_at, completed_at)
       values ($1, $2, 'assistant', 'completed', now() - interval '7 minutes', now() - interval '6 minutes')`,
      [messageId, conversationId],
    );
    await client.query(
      `insert into message_parts (message_id, type, content_encrypted, sort_order)
       values ($1, 'text', 'expired encrypted content', 0)`,
      [messageId],
    );
    await client.query(
      `insert into tool_invocations
       (id, workspace_id, conversation_id, message_id, tool_source, tool_id, tool_name, status)
       values ($1, $2, $3, $4, 'built_in', $5, 'expired_test_tool', 'completed')`,
      [invocationId, workspaceId, conversationId, messageId, randomUUID()],
    );

    const { purgeExpiredEphemeralConversations } =
      await import("@/modules/chat/ephemeral-cleanup");
    await purgeExpiredEphemeralConversations({ batchSize: 500 });

    const remaining = await client.query<{
      conversations: number;
      messages: number;
      parts: number;
      invocations: number;
    }>(
      `select
        (select count(*)::int from conversations where id = $1) as conversations,
        (select count(*)::int from messages where id = $2) as messages,
        (select count(*)::int from message_parts where message_id = $2) as parts,
        (select count(*)::int from tool_invocations where id = $3) as invocations`,
      [conversationId, messageId, invocationId],
    );
    expect(remaining.rows[0]).toEqual({
      conversations: 0,
      messages: 0,
      parts: 0,
      invocations: 0,
    });
  } finally {
    await client.query("delete from tool_invocations where id = $1", [
      invocationId,
    ]);
    await client.query("delete from messages where id = $1", [messageId]);
    await client.query("delete from conversations where id = $1", [
      conversationId,
    ]);
    await client.end();
  }
});

test("shares a conversation with continuation rules and a public link", async ({
  page,
}) => {
  const conversation = await createConversation();
  try {
    await page.goto(
      `/en/chat?agentId=${conversation.agentId}&conversationId=${conversation.id}`,
    );
    await activate(page.getByRole("button", { name: "Share conversation" }));
    await expect(
      page.getByRole("dialog", { name: "Share conversation" }),
    ).toBeVisible();
    await page.getByLabel("Workspace member email").fill(e2eMember.email);
    await page.getByLabel("Allow this person to continue").check();
    await activate(
      page.getByRole("combobox", { name: "Where new messages appear" }),
    );
    await activate(page.getByRole("option", { name: "Same conversation" }));
    await activate(page.getByRole("button", { name: "Share", exact: true }));
    await expect(
      page.getByText(e2eMember.email, { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText(`${e2eMember.email} · Same conversation`),
    ).toBeVisible();

    await activate(page.getByRole("switch", { name: "Public read-only link" }));
    await expect(
      page.getByRole("switch", { name: "Public read-only link" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page.getByRole("button", { name: "Copy public link" }),
    ).toBeVisible();
  } finally {
    await deleteConversation(conversation.id);
  }
});

test("previews an uploaded PDF natively without requesting parsed text", async ({
  page,
}) => {
  await ensureE2EAssistant();
  let extractedPreviewRequests = 0;
  await page.route(
    "**/api/workspace/chat-attachments/upload?*",
    async (route) => {
      if (
        new URL(route.request().url()).searchParams.get("phase") === "chunk"
      ) {
        await route.fulfill({ status: 202, json: { accepted: true } });
        return;
      }
      await route.fulfill({
        json: {
          attachment: {
            kind: "chat_file",
            id: "20000000-0000-4000-8000-000000000099",
            fileName: "native-preview.pdf",
            mimeType: "application/pdf",
            size: 45,
            hash: "pdf-hash",
            url: "/api/workspace/chat-attachments/mock-pdf",
            category: "document",
            extractionStatus: "readable",
            extractedTextChars: 120,
          },
        },
      });
    },
  );
  await page.route(
    "**/api/workspace/chat-attachments/*/extracted",
    async (route) => {
      extractedPreviewRequests += 1;
      await route.fulfill({
        json: { text: "Parsed text should not be shown" },
      });
    },
  );
  await page.route(
    "**/api/workspace/chat-attachments/mock-pdf",
    async (route) => {
      await route.fulfill({
        contentType: "application/pdf",
        body: Buffer.from("%PDF-1.4\n%%EOF"),
      });
    },
  );

  await page.goto("/en/chat");
  await activate(page.getByRole("button", { name: "Current assistant" }));
  await activate(page.getByRole("menuitem", { name: /E2E menu assistant/ }));
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toBeEnabled();
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "native-preview.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF"),
    });
  const preview = page.getByRole("button", {
    name: "View extracted text for native-preview.pdf",
  });
  await expect(preview).toBeVisible({ timeout: 15_000 });
  await activate(preview);
  await expect(
    page.getByRole("dialog", { name: "native-preview.pdf" }),
  ).toBeVisible();
  await expect(
    page.locator('iframe[title="native-preview.pdf"]'),
  ).toHaveAttribute("src", "/api/workspace/chat-attachments/mock-pdf");
  expect(extractedPreviewRequests).toBe(0);
});
