import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

import {
  activate,
  databaseUrl,
  ensureE2EAssistant,
  ensureE2EMember,
  ensureE2EUser,
  login,
} from "./fixtures";
import * as temporaryChat from "./temporary-chat-assertions";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

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
  await expect(
    page.getByText("Saved conversation", { exact: true }),
  ).toHaveCount(0);
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

    await temporaryChat.expectTemporaryConversationInHistory(page, title);

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
    await temporaryChat.expectTransientPersistenceConfirmation(page);
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
