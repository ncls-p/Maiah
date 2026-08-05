import { beforeEach,describe,expect,it,vi } from "vitest";

import { callRemoteMcpTool } from "@/modules/mcp/client";
import { getMcpServer } from "@/modules/mcp/use-cases";
import { resolveToolExecutionHeaders } from "@/modules/tool-connections/use-cases";
import { dbModule,resetDb } from "./executor-and-sidebar.test.db-module";

// ─── MCP Executor ─────────────────────────────────────────────────────

describe("mcp/executor", async () => {
  const fakeSseServer = {
    id: "srv-1",
    workspaceId: "ws-1",
    name: "Remote Server",
    transport: "sse" as const,
    command: null,
    argsJson: null,
    url: "https://mcp.example.com/sse",
    encryptedHeadersJson: null,
    encryptedEnvJson: null,
    enabled: true,
    requireApproval: false,
    isGlobal: false,
    healthStatus: "healthy",
    lastCheckedAt: null,
    createdById: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    vi.mocked(callRemoteMcpTool).mockReset();
    vi.mocked(getMcpServer).mockReset();
    vi.mocked(resolveToolExecutionHeaders).mockReset().mockResolvedValue({});
  });

  it("throws when server not found", async () => {
    (vi.mocked(getMcpServer) as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { executeMcpTool } = await import("../../src/modules/mcp/executor");
    await expect(
      executeMcpTool({
        serverId: "srv-1",
        toolId: "tool-1",
        workspaceId: "ws-1",
        toolInput: {},
      }),
    ).rejects.toThrow("MCP server not found");
  });

  it("throws when server disabled", async () => {
    vi.mocked(getMcpServer).mockResolvedValue({
      ...fakeSseServer,
      enabled: false,
    });

    const { executeMcpTool } = await import("../../src/modules/mcp/executor");
    await expect(
      executeMcpTool({
        serverId: "srv-1",
        toolId: "tool-1",
        workspaceId: "ws-1",
        toolInput: {},
      }),
    ).rejects.toThrow("MCP server is disabled");
  });

  it("throws when server URL not configured", async () => {
    vi.mocked(getMcpServer).mockResolvedValue({
      ...fakeSseServer,
      url: null,
    });

    const { executeMcpTool } = await import("../../src/modules/mcp/executor");
    await expect(
      executeMcpTool({
        serverId: "srv-1",
        toolId: "tool-1",
        workspaceId: "ws-1",
        toolInput: {},
      }),
    ).rejects.toThrow("MCP server URL is not configured");
  });

  it("throws when tool not found", async () => {
    vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);

    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([]);

    const { executeMcpTool } = await import("../../src/modules/mcp/executor");
    await expect(
      executeMcpTool({
        serverId: "srv-1",
        toolId: "tool-1",
        workspaceId: "ws-1",
        toolInput: {},
      }),
    ).rejects.toThrow("MCP tool not found");
  });

  it("returns structuredContent when present", async () => {
    vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);
    vi.mocked(callRemoteMcpTool).mockResolvedValue({
      structuredContent: { result: "data" },
      content: [{ type: "text", text: "raw" }],
    });

    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([{ id: "tool-1", name: "search", enabled: true }]);

    const { executeMcpTool } = await import("../../src/modules/mcp/executor");
    const result = await executeMcpTool({
      serverId: "srv-1",
      toolId: "tool-1",
      workspaceId: "ws-1",
      toolInput: { query: "test" },
    });
    expect(result).toEqual({ result: "data" });
  });

  it("passes per-user gateway headers when a user id is present", async () => {
    vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);
    vi.mocked(resolveToolExecutionHeaders).mockResolvedValue({
      "x-maiah-tool-context": "payload",
      "x-maiah-tool-context-signature": "sig",
    });
    vi.mocked(callRemoteMcpTool).mockResolvedValue({
      structuredContent: { result: "data" },
      content: [{ type: "text", text: "data" }],
    });

    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([{ id: "tool-1", name: "search", enabled: true }]);

    const { executeMcpTool } = await import("../../src/modules/mcp/executor");
    await executeMcpTool({
      serverId: "srv-1",
      toolId: "tool-1",
      workspaceId: "ws-1",
      userId: "user-1",
      toolInput: { query: "test" },
    });

    expect(resolveToolExecutionHeaders).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: "user-1",
      toolSource: "mcp",
      toolId: "tool-1",
      mcpServerId: "srv-1",
    });
    expect(callRemoteMcpTool).toHaveBeenCalledWith(
      fakeSseServer,
      "search",
      { query: "test" },
      {
        headers: {
          "x-maiah-tool-context": "payload",
          "x-maiah-tool-context-signature": "sig",
        },
      },
    );
  });

  it("returns content when only content present", async () => {
    vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);
    vi.mocked(callRemoteMcpTool).mockResolvedValue({
      content: [{ type: "text", text: "raw response" }],
    });

    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([{ id: "tool-1", name: "search", enabled: true }]);

    const { executeMcpTool } = await import("../../src/modules/mcp/executor");
    const result = await executeMcpTool({
      serverId: "srv-1",
      toolId: "tool-1",
      workspaceId: "ws-1",
      toolInput: {},
    });
    expect(result).toEqual([{ type: "text", text: "raw response" }]);
  });

  it("rejects MCP application errors instead of treating them as tool successes", async () => {
    vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);
    vi.mocked(callRemoteMcpTool).mockResolvedValue({
      isError: true,
      structuredContent: {
        result: "Invalid repoName format",
        apiKey: "must-not-leak",
      },
      content: [{ type: "text", text: "raw error" }],
    });

    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([{ id: "tool-1", name: "search", enabled: true }]);

    const { executeMcpTool } = await import("../../src/modules/mcp/executor");
    const error = await executeMcpTool({
      serverId: "srv-1",
      toolId: "tool-1",
      workspaceId: "ws-1",
      toolInput: {},
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("MCP tool failed: Invalid repoName format");
    expect((error as Error).message).not.toContain("must-not-leak");
  });

  it("returns { ok: true } when result has no structuredContent or content", async () => {
    vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);
    // When result has no structuredContent and no content properties
    vi.mocked(callRemoteMcpTool).mockResolvedValue({
      someOtherField: "value",
      content: undefined as never,
      structuredContent: undefined as never,
    });

    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([{ id: "tool-1", name: "search", enabled: true }]);

    const { executeMcpTool } = await import("../../src/modules/mcp/executor");
    const result = await executeMcpTool({
      serverId: "srv-1",
      toolId: "tool-1",
      workspaceId: "ws-1",
      toolInput: {},
    });
    expect(result).toEqual({ ok: true });
  });
});
