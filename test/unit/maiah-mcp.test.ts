import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  availableActions,
  actionPath,
  describeAction,
  type McpIdentity,
} from "@/modules/maiah-mcp/catalog";
import { executeAction } from "@/modules/maiah-mcp/actions";
import { createMaiahMcpServer } from "@/modules/maiah-mcp/server";

const identity: McpIdentity = {
  userId: "user",
  workspaceId: "workspace",
  authentication: "apiKey",
  headers: { Authorization: "Bearer test-token" },
};
afterEach(() => vi.unstubAllGlobals());
describe("Maiah MCP action boundary", () => {
  it("excludes recursive, public and session-only endpoints from API token actions", () => {
    const actions = availableActions(identity);
    expect(actions.length).toBeGreaterThan(50);
    expect(
      actions.some((action) =>
        /^\/api\/(auth|mcp|companion|admin|v1|health)(\/|$)/.test(action.path),
      ),
    ).toBe(false);
    expect(
      availableActions({ ...identity, authentication: "session" }).some(
        (action) => action.path.startsWith("/api/admin/"),
      ),
    ).toBe(true);
  });
  it("rejects path traversal, foreign origins and missing parameters", () => {
    const action = availableActions(identity).find(
      (action) => action.pathParameters.length,
    )!;
    const name = action.pathParameters[0]!;
    for (const value of [
      "..",
      "../admin",
      "%2fadmin",
      "https://evil.test",
      "a?b=c",
      "a\\b",
    ]) {
      expect(() => actionPath(action, { [name]: value }, {})).toThrow();
    }
    expect(() => actionPath(action, {}, {})).toThrow();
  });
  it("executes against the configured origin with caller credentials and preserves a refusal", async () => {
    const action = availableActions(identity).find(
      (action) => action.method === "GET" && action.pathParameters.length === 0,
    )!;
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: "Forbidden" },
          { status: 403, headers: { "x-request-id": "ref-1" } },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await executeAction(identity, {
      operationId: action.operationId,
      parameters: {},
      query: { workspaceId: "foreign" },
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      requestId: "ref-1",
      result: { error: "Forbidden" },
    });
    const [url, options] = fetch.mock.calls[0];
    expect(url.pathname).toBe(action.path);
    expect(url.searchParams.get("workspaceId")).toBe("foreign");
    expect(options).toMatchObject({
      redirect: "error",
      cache: "no-store",
      headers: { Authorization: "Bearer test-token" },
    });
  });
  it("rejects oversized bodies before making a request", async () => {
    const action = availableActions(identity).find(
      (action) => action.bodyKind === "json",
    )!;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      executeAction(identity, {
        operationId: action.operationId,
        parameters: Object.fromEntries(
          action.pathParameters.map((name) => [name, "id"]),
        ),
        query: {},
        body: { text: "x".repeat(256001) },
      }),
    ).rejects.toThrow("too large");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("serves discovery and contracts through the actual MCP protocol", async () => {
    const server = createMaiahMcpServer(identity);
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
        [
          "maiah_search_actions",
          "maiah_describe_action",
          "maiah_execute_action",
        ],
      );
      const result = await client.callTool({
        name: "maiah_search_actions",
        arguments: { query: "workspaces" },
      });
      expect(JSON.stringify(result)).toContain("getWorkspaces");
      expect(describeAction(identity, "getWorkspaces")).toHaveProperty(
        "contract",
      );
      const invalid = await client.callTool({
        name: "maiah_execute_action",
        arguments: { operationId: "https://evil.test" },
      });
      expect(invalid.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
