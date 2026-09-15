import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import {
  databaseUrl,
  ensureE2EAssistant,
  ensureE2EUser,
  login,
} from "./fixtures";
import { startMcpOAuthServer } from "../fixtures/mcp-oauth-server";
test("MCP OAuth authorization, manual resync and periodic worker synchronization", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const remote = await startMcpOAuthServer(18182);
  const database = new Client({ connectionString: databaseUrl() });
  await database.connect();
  let serverId: string | undefined;
  try {
    await ensureE2EUser();
    await login(page);
    await page.request.post("/api/workspaces");
    const { workspaceId } = await ensureE2EAssistant();
    await page.request.patch("/api/workspaces", { data: { workspaceId } });
    const name = `OAuth browser ${randomUUID().slice(0, 8)}`;
    const created = await page.request.post("/api/workspace/mcp-servers", {
      data: {
        workspaceId,
        name,
        transport: "streamable-http",
        url: `${remote.origin}/mcp`,
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    serverId = (await created.json()).id;
    await page.goto("/en/mcp");
    await page.getByText(name, { exact: true }).click();
    await page.getByRole("button", { name: "OAuth 2.0", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "OAuth 2.0 connection" });
    await dialog.getByRole("switch", { name: "Use OAuth 2.0" }).check();
    await dialog
      .getByLabel("Client ID", { exact: true })
      .fill("browser-client");
    await dialog.getByRole("button", { name: "Save OAuth settings" }).click();
    await expect(
      dialog.getByText("Settings saved. You can now authorize your account."),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Authorize my account" }).click();
    await expect(page).toHaveURL(/\/tools\?tab=mcp/);
    await expect(
      page.getByText("Your account is connected.", { exact: true }),
    ).toBeVisible();
    await page.getByText(name, { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Resynchronize", exact: true }),
    ).toBeVisible();
    const endpoint = `/api/workspace/mcp-servers/${serverId}/tools?workspaceId=${workspaceId}`;
    const original = (await (await page.request.get(endpoint)).json())[0];
    expect(original.name).toBe("search");
    remote.state.tools.push({
      name: "manual_added",
      description: "Manual update",
      inputSchema: { type: "object", properties: {} },
    });
    await page
      .getByRole("button", { name: "Resynchronize", exact: true })
      .click();
    await expect(page.getByText("manual_added", { exact: true })).toBeVisible();
    const tools = await (await page.request.get(endpoint)).json();
    expect(
      tools.find((tool: { name: string }) => tool.name === "search").id,
    ).toBe(original.id);
    remote.state.tools.push({
      name: "automatic_added",
      description: "Periodic update",
      inputSchema: { type: "object", properties: {} },
    });
    await database.query(
      "update mcp_sync_state set next_sync_at='2000-01-01' where server_id=$1",
      [serverId],
    );
    await expect
      .poll(
        async () => {
          const values = await (await page.request.get(endpoint)).json();
          return values.some(
            (tool: { name: string }) => tool.name === "automatic_added",
          );
        },
        { timeout: 90_000, intervals: [1000, 3000, 5000] },
      )
      .toBe(true);
    await page.reload();
    await page.getByText(name, { exact: true }).click();
    await expect(
      page.getByText("automatic_added", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "OAuth 2.0", exact: true }).click();
    await expect(
      dialog.getByText("Your account is connected.", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Disconnect my account" }).click();
    await expect(
      dialog.getByText("Your account is not connected.", { exact: true }),
    ).toBeVisible();
    expect(remote.state.revocations).toBe(2);
    const stdio = await page.request.post("/api/workspace/mcp-servers", {
      data: {
        workspaceId,
        name: "unsupported",
        transport: "stdio",
        command: "node",
      },
    });
    expect(stdio.status()).toBe(400);
  } finally {
    if (serverId)
      await database.query("delete from mcp_servers where id=$1", [serverId]);
    await database.end();
    await remote.close();
  }
});
