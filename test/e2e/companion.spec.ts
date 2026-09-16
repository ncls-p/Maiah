import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  databaseUrl,
  ensureE2EAssistant,
  ensureE2EMember,
  e2eMember,
  login,
  loginWithCredentials,
} from "./fixtures";
import {
  writeStream,
  writeToolCall,
  usage,
} from "./workflow-agentic-live.spec.upstream";

test("global companion performs live page and MCP actions, persists and respects roles", async ({
  page,
  browser,
}) => {
  test.setTimeout(100_000);
  const { agentId, workspaceId } = await ensureE2EAssistant();
  await ensureE2EMember();
  await login(page);
  await page.request.patch("/api/workspaces", { data: { workspaceId } });
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  const organizationId = (
    await db.query("select organization_id from workspaces where id=$1", [
      workspaceId,
    ])
  ).rows[0].organization_id;
  const keys = [
    "companion:enabled",
    `companion:organization:${organizationId}`,
  ];
  const previous = (
    await db.query("select * from app_settings where key = ANY($1::text[])", [
      keys,
    ])
  ).rows;
  const provider = (
    await db.query(
      "select base_url,openai_compatible_api_route from ai_providers where id='10000000-0000-4000-8000-000000000001'",
    )
  ).rows[0];
  const privateAgent = (
    await db.query("select visibility,sharing_mode from agents where id=$1", [
      agentId,
    ])
  ).rows[0];
  const folderName = `Companion MCP ${randomUUID()}`;
  const contexts: string[] = [];
  let step = 0;
  let target = "";
  let seenTools: string[] = [];
  let compatibleToolSchema = false;
  let memberMode = false;
  let memberCalled = false;
  let memberDenied = false;
  let staleActionRejected = false;
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    seenTools = (body.tools ?? []).map(
      (tool: { function: { name: string } }) => tool.function.name,
    );
    compatibleToolSchema =
      body.tools?.find(
        (tool: { function: { name: string; strict?: boolean } }) =>
          tool.function.name === "maiah_execute_action",
      )?.function.strict === false;
    const toolMessages = (body.messages ?? []).filter(
      (message: { role: string }) => message.role === "tool",
    );
    if (memberMode) {
      if (!memberCalled) {
        memberCalled = true;
        writeToolCall(response, {
          created: 1,
          model: "e2e-model",
          id: "denied-admin",
          name: "maiah_execute_action",
          arguments: { operationId: "getAdminUsers" },
        });
        return;
      }
      memberDenied = JSON.stringify(toolMessages).includes("403");
    }
    if (step === 2)
      staleActionRejected =
        /false|unavailable|changed/i.test(
          JSON.stringify(toolMessages.at(-1)),
        ) &&
        (await page
          .getByRole("textbox", { name: "Companion test field" })
          .inputValue()) === "Original";
    if (step === 1 || step === 3) {
      const content = toolMessages.at(-1)?.content;
      contexts.push(JSON.stringify(content));
      const context =
        typeof content === "string" ? JSON.parse(content) : content;
      target = context.elements.find(
        (element: { label: string }) =>
          element.label === "Companion test field",
      )?.id;
    }
    if (step === 1)
      await page.evaluate(() =>
        history.replaceState(
          null,
          "",
          `${location.pathname}?companion-stale-test=1`,
        ),
      );
    const operations = [
      { name: "maiah_page_context", arguments: {} },
      {
        name: "maiah_ui_action",
        arguments: {
          action: "fill",
          path: "/en/agents",
          target,
          value: "Edited visibly",
        },
      },
      { name: "maiah_page_context", arguments: {} },
      {
        name: "maiah_ui_action",
        arguments: {
          action: "fill",
          path: "/en/agents",
          target,
          value: "Edited visibly",
        },
      },
      {
        name: "maiah_execute_action",
        arguments: {
          operationId: "postWorkspaceConversationFolders",
          body: { workspaceId, name: folderName },
        },
      },
      {
        name: "maiah_ui_action",
        arguments: { action: "navigate", path: "/en/tools" },
      },
    ];
    if (step < operations.length) {
      const operation = operations[step++];
      writeToolCall(response, {
        created: 1,
        model: "e2e-model",
        id: `companion-${step}`,
        ...operation,
      });
    } else {
      contexts.push(JSON.stringify(toolMessages));
      writeStream(response, [
        {
          id: "done",
          object: "chat.completion.chunk",
          created: 1,
          model: "e2e-model",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: "Companion task completed.",
              },
              finish_reason: "stop",
            },
          ],
          usage: usage(),
        },
      ]);
    }
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, "127.0.0.1", resolve),
  );
  const memberContext = await browser.newContext();
  try {
    await db.query(
      "update ai_providers set base_url=$1,openai_compatible_api_route='chat-completions' where id='10000000-0000-4000-8000-000000000001'",
      [`http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`],
    );
    await db.query(
      "update agents set visibility='private', sharing_mode='private' where id=$1",
      [agentId],
    );
    const config = await page.request.patch(
      `/api/companion/settings?organizationId=${organizationId}`,
      { data: { enabled: true, agentId } },
    );
    expect(config.status(), await config.text()).toBe(200);
    const member = await memberContext.newPage();
    await loginWithCredentials(member, e2eMember);
    expect(
      (
        await member.request.patch(
          `/api/companion/settings?organizationId=${organizationId}`,
          { data: { enabled: false } },
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await member.request.get(`/api/companion?workspaceId=${workspaceId}`)
      ).status(),
    ).toBe(200);
    await page.goto("/en/agents");
    const launcher = page.getByRole("button", {
      name: "Open companion",
      exact: true,
    });
    await expect(launcher).toBeVisible();
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "companion-test-fields";
      host.style.cssText =
        "position:fixed;left:20px;top:100px;z-index:40;background:white";
      host.innerHTML =
        '<input aria-label="Companion test field" value="Original"><input type="password" value="NEVER_SHARE_PASSWORD"><input aria-label="API token" value="NEVER_SHARE_TOKEN"><div data-companion-private>NEVER_SHARE_STATIC</div><code>ahub_AAAAAAAAAAAAAAAAAAAAAAAA</code>';
      document.body.appendChild(host);
    });
    await launcher.click();
    const panel = page.getByRole("dialog", { name: "Maiah companion" });
    await expect(panel).toBeVisible();
    await panel
      .getByRole("textbox", { name: "Message the companion" })
      .fill(
        "Edit the test field, create my conversation folder and go to tools.",
      );
    await panel.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Companion test field" }),
    ).toHaveValue("Edited visibly", { timeout: 25000 });
    await expect(page).toHaveURL(/\/en\/tools/, { timeout: 25000 });
    await expect(
      panel.getByText("Companion task completed.", { exact: true }),
    ).toBeVisible({ timeout: 25000 });
    expect(staleActionRejected).toBe(true);
    expect(compatibleToolSchema).toBe(true);
    expect(seenTools).toEqual(
      expect.arrayContaining([
        "maiah_page_context",
        "maiah_execute_action",
        "maiah_ui_action",
      ]),
    );
    expect(contexts.join(" ")).not.toMatch(
      /NEVER_SHARE_PASSWORD|NEVER_SHARE_TOKEN|NEVER_SHARE_STATIC|ahub_A{24}/,
    );
    expect(
      (
        await db.query("select id from conversation_folders where name=$1", [
          folderName,
        ])
      ).rowCount,
    ).toBe(1);
    await page.evaluate(() =>
      document.getElementById("companion-test-fields")?.remove(),
    );
    const before = await panel.boundingBox();
    await panel
      .getByRole("button", { name: "Move companion" })
      .press("ArrowLeft");
    const after = await panel.boundingBox();
    expect(after!.x).toBeLessThan(before!.x);
    await panel.getByRole("button", { name: "Collapse companion" }).click();
    await expect(panel).toBeHidden();
    await launcher.click();
    await expect(
      panel.getByText("Companion task completed.", { exact: true }),
    ).toBeVisible();
    let failHistory = true;
    await page.route("**/api/workspace/conversations/*", async (route) => {
      if (
        failHistory &&
        /\/conversations\/[a-f0-9-]+$/.test(
          new URL(route.request().url()).pathname,
        )
      ) {
        failHistory = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary history failure" }),
        });
      } else await route.continue();
    });
    await page.reload();
    await launcher.click();
    await expect(panel.getByText(/Temporary history failure/)).toBeVisible();
    await panel.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      panel.getByText("Companion task completed.", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await panel.boundingBox();
    expect(mobile!.x).toBeGreaterThanOrEqual(0);
    expect(mobile!.x + mobile!.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: "output/playwright/companion-mobile.png" });
    memberMode = true;
    await member.request.patch("/api/workspaces", { data: { workspaceId } });
    await member.goto("/en/providers");
    await member
      .getByRole("button", { name: "Open companion", exact: true })
      .click();
    const memberPanel = member.getByRole("dialog", { name: "Maiah companion" });
    await memberPanel
      .getByRole("textbox", { name: "Message the companion" })
      .fill("Say hello.");
    await memberPanel
      .getByRole("button", { name: "Send", exact: true })
      .click();
    await expect(
      memberPanel.getByText("Companion task completed.", { exact: true }),
    ).toBeVisible({ timeout: 25000 });
    expect(memberDenied).toBe(true);
    const revoked = await page.request.patch(
      `/api/companion/settings?organizationId=${organizationId}`,
      { data: { enabled: false } },
    );
    expect(revoked.status()).toBe(200);
    expect(
      (
        await page.request.post(`/api/workspace/${agentId}/chat`, {
          data: {
            workspaceId,
            companionContextId: randomUUID(),
            content: "revoked",
          },
        })
      ).status(),
    ).toBe(403);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("maiah:companion-settings")),
    );
    await expect(panel).toBeHidden();
  } finally {
    await memberContext.close();
    await db.query("delete from conversation_folders where name=$1", [
      folderName,
    ]);
    await db.query(
      "update agents set visibility=$1,sharing_mode=$2 where id=$3",
      [privateAgent.visibility, privateAgent.sharing_mode, agentId],
    );
    await db.query(
      "update ai_providers set base_url=$1,openai_compatible_api_route=$2 where id='10000000-0000-4000-8000-000000000001'",
      [provider.base_url, provider.openai_compatible_api_route],
    );
    await db.query("delete from app_settings where key = ANY($1::text[])", [
      keys,
    ]);
    for (const row of previous)
      await db.query(
        "insert into app_settings(key,value_json,updated_by_user_id,updated_at) values($1,$2,$3,$4)",
        [
          row.key,
          JSON.stringify(row.value_json),
          row.updated_by_user_id,
          row.updated_at,
        ],
      );
    await db.end();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
