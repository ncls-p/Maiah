import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID, createHmac } from "node:crypto";
import {
  databaseUrl,
  ensureE2EAssistant,
  ensureE2EUser,
  login,
  e2eUser,
} from "./fixtures";
import { encryptValue } from "@/lib/crypto";
import { HANDOFF_TOOL } from "@/modules/genesys/contracts";

test("organization connection and human chat survive refresh and signed webhook retries", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await ensureE2EUser();
  await login(page);
  const primary = await page.request.post("/api/workspaces");
  expect(primary.ok(), await primary.text()).toBe(true);
  const { agentId, workspaceId } = await ensureE2EAssistant();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  const conversationId = randomUUID(),
    integrationId = randomUUID();
  const secret = "genesys-browser-webhook-signature-secret";
  let connectionId: string | undefined;
  let versionId: string | undefined;
  try {
    const result = await client.query(
      'select w.organization_id, w.name, u.id as user_id, a.active_version_id from workspaces w join "user" u on u.email = $2 join agents a on a.id = $3 where w.id = $1',
      [workspaceId, e2eUser.email, agentId],
    );
    const {
      organization_id: organizationId,
      name: workspaceName,
      user_id: userId,
      active_version_id: activeVersionId,
    } = result.rows[0];
    versionId = activeVersionId;
    await login(page);
    await page.request.patch("/api/workspaces", { data: { workspaceId } });
    await page.goto("/en/admin/settings");
    const panel = page.getByRole("region", {
      name: "Genesys Cloud connection",
    });
    await expect(panel).toBeVisible();
    await panel
      .getByLabel("OAuth client ID", { exact: true })
      .fill(randomUUID());
    await panel
      .getByLabel("OAuth secret", { exact: true })
      .fill("browser-test-secret");
    await panel
      .getByLabel("Open Messaging integration ID", { exact: true })
      .fill(integrationId);
    await panel
      .getByLabel("Webhook signature secret", { exact: true })
      .fill(secret);
    await panel
      .getByRole("checkbox", { name: workspaceName, exact: true })
      .check();
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      panel.getByText("Connection saved. Test it before use."),
    ).toBeVisible();
    const stored = await page.request.get(
      `/api/organizations/${organizationId}/genesys`,
    );
    expect(stored.ok(), await stored.text()).toBe(true);
    const saved = await stored.json();
    connectionId = saved.connection.id;
    expect(JSON.stringify(saved)).not.toContain("browser-test-secret");
    expect(JSON.stringify(saved)).not.toContain(secret);
    await expect(panel.getByLabel("Webhook URL")).toHaveValue(
      new RegExp(`/api/webhooks/genesys/${connectionId}$`),
    );
    // Remote contracts are tested with a simulated transport in the PostgreSQL suite.
    // The browser test seeds only their verified outcome and exercises real authenticated routes/webhooks.
    await client.query(
      "update genesys_connections set validated_at = now() where id = $1",
      [connectionId],
    );
    await client.query(
      "insert into agent_tool_bindings (agent_version_id, tool_source, tool_id) values ($1, 'builtin', $2) on conflict do nothing",
      [versionId, HANDOFF_TOOL.id],
    );
    await client.query(
      "insert into conversations (id, workspace_id, agent_id, user_id, title) values ($1,$2,$3,$4,'Genesys browser conversation')",
      [conversationId, workspaceId, agentId, userId],
    );
    const messageId = randomUUID();
    await client.query(
      "insert into messages (id,conversation_id,role,status) values ($1,$2,'user','completed')",
      [messageId, conversationId],
    );
    await client.query(
      "insert into message_parts (message_id,type,content_encrypted,sort_order) values ($1,'text',$2,0)",
      [messageId, await encryptValue("I need help with my account")],
    );
    await page.goto(
      `/en/chat?agentId=${agentId}&conversationId=${conversationId}`,
    );
    await page
      .getByRole("button", { name: "Talk to a consultant", exact: true })
      .click();
    await expect(
      page.getByText("Handoff requested. AI is paused."),
    ).toBeVisible();
    const state = await (
      await page.request.get(
        `/api/workspace/conversations/${conversationId}/handoff`,
      )
    ).json();
    const aiAttempt = await page.request.post(
      `/api/workspace/${agentId}/chat`,
      { data: { content: "hello", conversationId, workspaceId } },
    );
    expect(aiAttempt.status()).toBe(409);
    await client.query(
      "update genesys_sessions set state='human', updated_at=now() where id=$1",
      [state.session.id],
    );
    await page.reload();
    await expect(
      page.getByText(
        "A consultant has taken over the conversation in Genesys.",
      ),
    ).toBeVisible();
    await page
      .getByLabel("Message to the consultant")
      .fill("Could you check my account?");
    await page.getByRole("button", { name: "Send to consultant" }).click();
    await expect(page.getByLabel("Message to the consultant")).toHaveValue("");
    await expect(
      page.getByText("Could you check my account?", { exact: true }),
    ).toBeVisible();
    const body = JSON.stringify({
      id: "browser-reply",
      type: "Text",
      text: "Hello, I can help with your account.",
      channel: { id: integrationId, to: { id: state.session.id } },
      direction: "Outbound",
    });
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const endpoint = `/api/webhooks/genesys/${connectionId}`;
    expect(
      (
        await page.request.post(endpoint, {
          data: body,
          headers: { "x-hub-signature-256": "bad" },
        })
      ).status(),
    ).toBe(401);
    for (let attempt = 0; attempt < 2; attempt++)
      expect(
        (
          await page.request.post(endpoint, {
            data: body,
            headers: { "x-hub-signature-256": signature },
          })
        ).ok(),
      ).toBe(true);
    await expect(
      page.getByText("Hello, I can help with your account.", { exact: false }),
    ).toHaveCount(1);
    await expect(
      page.getByText("Support Genesys", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Resume with AI" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "output/playwright/genesys-handoff-mobile.png",
      fullPage: true,
    });
    await client.query(
      "update genesys_sessions set state='completed', updated_at=now() where id=$1",
      [state.session.id],
    );
    await page.reload();
    await page.getByRole("button", { name: "Resume with AI" }).click();
    await expect(
      page.getByRole("button", { name: "Talk to a consultant", exact: true }),
    ).toBeVisible();
  } finally {
    await client.query(
      "delete from message_parts where message_id in (select id from messages where conversation_id=$1)",
      [conversationId],
    );
    await client.query("delete from messages where conversation_id=$1", [
      conversationId,
    ]);
    await client.query("delete from conversations where id=$1", [
      conversationId,
    ]);
    if (connectionId)
      await client.query("delete from genesys_connections where id=$1", [
        connectionId,
      ]);
    if (versionId)
      await client.query(
        "delete from agent_tool_bindings where agent_version_id=$1 and tool_id=$2",
        [versionId, HANDOFF_TOOL.id],
      );
    await client.end();
  }
});
