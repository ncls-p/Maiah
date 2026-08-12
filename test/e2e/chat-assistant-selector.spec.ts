import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

import { databaseUrl, ensureE2EAssistantPair, login } from "./fixtures";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

let primaryAgentId: string;
let alternateAgentId: string;
let workspaceId: string;

async function createPrimaryConversation() {
  const conversationId = randomUUID();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(
      `insert into conversations
       (id, workspace_id, agent_id, agent_version_id, user_id, title, status,
        created_at, updated_at)
       select $1, $2, $3, a.active_version_id, u.id,
              'E2E assistant selector', 'active', now(), now()
       from agents a, "user" u
       where a.id = $3 and u.email = 'e2e-admin@example.test'`,
      [conversationId, workspaceId, primaryAgentId],
    );
    return conversationId;
  } finally {
    await client.end();
  }
}

async function deleteConversation(conversationId: string) {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("delete from conversations where id = $1", [
      conversationId,
    ]);
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  ({
    agentId: primaryAgentId,
    alternateAgentId,
    workspaceId,
  } = await ensureE2EAssistantPair());
});

test.beforeEach(async ({ page }) => {
  await login(page);
  const response = await page.request.patch("/api/workspaces", {
    data: { workspaceId },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
});

test("switches assistant and model without reloading the chat page", async ({
  page,
}) => {
  await page.goto(`/fr/chat?agentId=${primaryAgentId}`);

  const selector = page.getByRole("button", { name: "Assistant actuel" });
  await expect(selector).toContainText("E2E menu assistant", {
    timeout: 15_000,
  });
  await expect(selector).toContainText("E2E model");
  const initialDocumentTimeOrigin = await page.evaluate(
    () => performance.timeOrigin,
  );

  await selector.click();
  await page.getByRole("menuitem", { name: /E2E alternate assistant/ }).click();

  await expect(page).toHaveURL(`/fr/chat?agentId=${alternateAgentId}`);
  await expect(selector).toContainText("E2E alternate assistant");
  await expect(selector).toContainText("E2E alternate model");
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(
    initialDocumentTimeOrigin,
  );

  await selector.click();
  await page.getByRole("menuitem", { name: /E2E menu assistant/ }).click();

  await expect(page).toHaveURL(`/fr/chat?agentId=${primaryAgentId}`);
  await expect(selector).toContainText("E2E menu assistant");
  await expect(selector).toContainText("E2E model");
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(
    initialDocumentTimeOrigin,
  );
});

test("keeps the chosen assistant when leaving an existing conversation", async ({
  page,
}) => {
  const conversationId = await createPrimaryConversation();
  try {
    const initialConversationLoad = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response
          .url()
          .endsWith(`/api/workspace/conversations/${conversationId}`),
    );
    await page.goto(
      `/fr/chat?conversationId=${conversationId}&agentId=${primaryAgentId}`,
    );
    await initialConversationLoad;
    const selector = page.getByRole("button", { name: "Assistant actuel" });
    await expect(selector).toContainText("E2E menu assistant", {
      timeout: 15_000,
    });
    const initialDocumentTimeOrigin = await page.evaluate(
      () => performance.timeOrigin,
    );
    let conversationReloads = 0;
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        request.url().endsWith(`/api/workspace/conversations/${conversationId}`)
      ) {
        conversationReloads += 1;
      }
    });

    await selector.click();
    await page
      .getByRole("menuitem", { name: /E2E alternate assistant/ })
      .click();

    await expect(page).toHaveURL(
      `/fr/chat?conversationId=${conversationId}&agentId=${alternateAgentId}`,
    );
    await expect(selector).toContainText("E2E alternate assistant");
    await page.waitForTimeout(1_000);
    await expect(selector).toContainText("E2E alternate assistant");
    expect(conversationReloads).toBe(0);

    await page
      .getByRole("button", { name: "Nouvelle conversation", exact: true })
      .click();

    await expect(page).toHaveURL(`/fr/chat?agentId=${alternateAgentId}`);
    await expect(selector).toContainText("E2E alternate assistant");
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(
      initialDocumentTimeOrigin,
    );
  } finally {
    await deleteConversation(conversationId);
  }
});

test("removes an unavailable assistant from the URL without losing the locale", async ({
  page,
}) => {
  await page.goto("/fr/chat?agentId=00000000-0000-4000-8000-000000000000");

  await expect(page).toHaveURL("/fr/chat");
  await expect(
    page.getByRole("button", { name: "Assistant actuel" }),
  ).toBeVisible({ timeout: 15_000 });
});
