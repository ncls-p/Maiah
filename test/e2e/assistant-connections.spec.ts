import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { databaseUrl, e2eUser, ensureE2EAssistant, login } from "./fixtures";

test("saves multiple assistant connections and narrows them in a conversation", async ({
  page,
}) => {
  const { workspaceId } = await ensureE2EAssistant();
  await login(page);
  await page.request.patch("/api/workspaces", { data: { workspaceId } });
  const sql = new Client({ connectionString: databaseUrl() });
  await sql.connect();
  const serverId = randomUUID(),
    toolId = randomUUID(),
    connectorId = randomUUID();
  const productionId = randomUUID(),
    testId = randomUUID();
  let agentId: string | undefined;
  try {
    const user = await sql.query('select id from "user" where email=$1', [
      e2eUser.email,
    ]);
    await sql.query(
      "insert into mcp_servers (id,workspace_id,name,transport,url,created_by_user_id) values ($1,$2,'Connection selection test','streamable-http','http://127.0.0.1:9/mcp',$3)",
      [serverId, workspaceId, user.rows[0].id],
    );
    await sql.query(
      'insert into mcp_tools (id,mcp_server_id,name,input_schema_json) values ($1,$2,\'search_incidents\',\'{"type":"object","properties":{}}\')',
      [toolId, serverId],
    );
    await sql.query(
      "insert into tool_connectors (id,workspace_id,created_by_user_id,key,name,kind,mcp_server_id) values ($1,$2,$3,'servicenow','ServiceNow','mcp',$4)",
      [connectorId, workspaceId, user.rows[0].id, serverId],
    );
    for (const [id, label, host] of [
      [productionId, "Production test", "production"],
      [testId, "Sandbox test", "sandbox"],
    ]) {
      await sql.query(
        "insert into tool_connections (id,workspace_id,connector_id,owner_type,label,config_json) values ($1,$2,$3,'workspace',$4,$5)",
        [
          id,
          workspaceId,
          connectorId,
          label,
          JSON.stringify({ instanceUrl: `https://${host}.service-now.com` }),
        ],
      );
    }
    const created = await page.request.post("/api/workspace/agents", {
      data: {
        workspaceId,
        name: "Connection routing assistant",
        providerId: "10000000-0000-4000-8000-000000000001",
        modelId: "10000000-0000-4000-8000-000000000002",
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const { agent, version } = await created.json();
    agentId = agent.id;
    const bound = await page.request.put(
      `/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}`,
      {
        data: {
          baseVersionId: version.id,
          bindings: [
            {
              toolSource: "mcp",
              toolId,
              mcpServerId: serverId,
              connectionIds: [productionId],
              requireApproval: false,
            },
          ],
        },
      },
    );
    expect(bound.ok(), await bound.text()).toBe(true);
    await page.goto(`/en/agents/${agentId}`);
    await page.getByRole("tab", { name: /Capabilities/ }).click();
    const prod = page.getByRole("checkbox", {
      name: "Production test https://production.service-now.com",
      exact: true,
    });
    const sandbox = page.getByRole("checkbox", {
      name: "Sandbox test https://sandbox.service-now.com",
      exact: true,
    });
    await expect(prod).toBeChecked();
    await expect(sandbox).not.toBeChecked();
    await sandbox.check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("Tools and knowledge saved", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: /Capabilities/ }).click();
    await expect(prod).toBeChecked();
    await expect(sandbox).toBeChecked();
    await page.goto(`/en/chat?agentId=${agentId}`);
    await page
      .getByRole("button", {
        name: /Capabilities.*active|Capabilities.*enabled|Capabilities/i,
      })
      .click();
    await expect(prod).toBeChecked();
    await sandbox.uncheck();
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: /Capabilities/i }).click();
    await expect(prod).toBeChecked();
    await expect(sandbox).not.toBeChecked();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page
        .locator("body")
        .evaluate((element) => element.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const payload = await (
      await page.request.get(
        `/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}&includeDetails=true&includeAvailable=true`,
      )
    ).json();
    expect(
      payload.mcpConnections[0].connections
        .map((item: { id: string }) => item.id)
        .sort(),
    ).toEqual([productionId, testId].sort());
  } finally {
    if (agentId) await sql.query("delete from agents where id=$1", [agentId]);
    await sql.query("delete from tool_connectors where id=$1", [connectorId]);
    await sql.query("delete from mcp_servers where id=$1", [serverId]);
    await sql.end();
  }
});
