import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ensureE2EAssistant, login } from "./fixtures";

test("external MCP client obeys token scopes, project boundaries and revocation", async ({
  page,
}) => {
  const { workspaceId } = await ensureE2EAssistant();
  await login(page);
  const tokenResponse = await page.request.post("/api/workspace/api-keys", {
    data: { workspaceId, name: "MCP protocol test", scopes: ["agents.list"] },
  });
  expect(tokenResponse.status()).toBe(201);
  const token = await tokenResponse.json();
  const url = new URL(
    "/api/mcp",
    process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
  );
  const client = new Client({ name: "external-test", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token.rawKey}` } },
  });
  const call = async (operationId: string, query: Record<string, string>) => {
    const result = await client.callTool({
      name: "maiah_execute_action",
      arguments: { operationId, query },
    });
    return JSON.parse((result.content as { text: string }[])[0].text);
  };
  try {
    expect(
      (
        await page.request.post("/api/mcp", {
          headers: {
            Authorization: `Bearer ${token.rawKey}`,
            Origin: "https://foreign.example",
          },
          data: {},
        })
      ).status(),
    ).toBe(403);
    await client.connect(transport);
    expect((await client.listTools()).tools).toHaveLength(4);
    const discovery = await client.callTool({
      name: "maiah_search_actions",
      arguments: { query: "/api/workspace/agents" },
    });
    const actions = JSON.parse(
      (discovery.content as { text: string }[])[0].text,
    ).actions;
    const list = actions.find(
      (action: { path: string; method: string }) =>
        action.path === "/api/workspace/agents" && action.method === "GET",
    );
    expect(list).toBeTruthy();
    expect(await call(list.operationId, { workspaceId })).toMatchObject({
      ok: true,
      status: 200,
    });
    expect(
      await call(list.operationId, {
        workspaceId: "00000000-0000-4000-8000-000000000099",
      }),
    ).toMatchObject({ ok: false, status: 403 });
    const providers = await client.callTool({
      name: "maiah_search_actions",
      arguments: { query: "/api/workspace/providers" },
    });
    const providerAction = JSON.parse(
      (providers.content as { text: string }[])[0].text,
    ).actions.find(
      (action: { path: string; method: string }) =>
        action.path === "/api/workspace/providers" && action.method === "GET",
    );
    expect(
      await call(providerAction.operationId, { workspaceId }),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      (
        await page.request.post("/api/mcp", {
          data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
        })
      ).status(),
    ).toBe(401);
    await page.request.delete(
      `/api/workspace/api-keys/${token.apiKey.id}?workspaceId=${workspaceId}`,
    );
    await expect(client.listTools()).rejects.toThrow();
  } finally {
    await client.close();
    await page.request.delete(
      `/api/workspace/api-keys/${token.apiKey.id}?workspaceId=${workspaceId}`,
    );
  }
});
