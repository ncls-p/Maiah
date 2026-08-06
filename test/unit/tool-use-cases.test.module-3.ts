import { describe,expect,it,vi } from "vitest";

import { canExecuteRestrictedTool,getAgentVersionToolContext,getCustomBindingContext,getMcpBindingContext,logToolInvocation } from "@/modules/tool/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { dbModule } from "./tool-use-cases.test.db-module";

describe("logToolInvocation", () => {
  it("inserts a tool invocation with encrypted input", async () => {
    const invocationRow = {
      id: "inv-1",
      workspaceId: "ws-1",
      toolName: "calculator",
      status: "success",
    };
    dbModule._ic.returning.mockResolvedValueOnce([invocationRow]);

    const result = await logToolInvocation({
      workspaceId: "ws-1",
      toolSource: "builtin",
      toolId: "tool-1",
      toolName: "calculator",
      input: { expression: "1+1" },
      output: { result: 2 },
      status: "success",
      latencyMs: 10,
    });

    expect(result).toEqual(invocationRow);
    expect(dbModule.db.insert).toHaveBeenCalled();
  });

  it("handles missing optional fields", async () => {
    dbModule._ic.returning.mockResolvedValueOnce([{ id: "inv-2", status: "failed" }]);

    const result = await logToolInvocation({
      workspaceId: "ws-1",
      toolSource: "builtin",
      toolId: "tool-1",
      toolName: "web_search",
      input: {},
      status: "failed",
      errorMessage: "Search error",
    });

    expect(result.status).toBe("failed");
  });

  it("redacts credentials embedded in persisted tool errors", async () => {
    dbModule._ic.returning.mockResolvedValueOnce([{ id: "inv-3", status: "failed" }]);

    await logToolInvocation({
      workspaceId: "ws-1",
      toolSource: "mcp",
      toolId: "tool-1",
      toolName: "webhook",
      input: {},
      status: "failed",
      errorMessage: "Request failed with Bearer hidden-token",
    });

    expect(dbModule._ic.values).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: "Request failed with Bearer [REDACTED]",
      }),
    );
  });
});

describe("canExecuteRestrictedTool", () => {
  it("returns true when permission is granted", async () => {
    vi.mocked(authorization.hasPermission).mockResolvedValueOnce(true);

    const result = await canExecuteRestrictedTool("user-1", "ws-1");
    expect(result).toBe(true);
  });

  it("returns false when permission is denied", async () => {
    vi.mocked(authorization.hasPermission).mockResolvedValueOnce(false);

    const result = await canExecuteRestrictedTool("user-1", "ws-1");
    expect(result).toBe(false);
  });
});

describe("getAgentVersionToolContext", () => {
  it("throws when agent version not found", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([]);

    await expect(getAgentVersionToolContext("v-nonexistent")).rejects.toThrow("Agent version not found");
  });

  it("returns version and bindings", async () => {
    // Q1: db.select({agentId}).from(agentVersions).where().limit(1) — .limit() terminal
    // Q2: db.select().from(agentToolBindings).where(and(...))        — .where() terminal
    // Q1's .where() must return chain so .limit() can be called
    dbModule._sc.where
      .mockReturnValueOnce(dbModule._sc) // Q1: keep chain for limit
      .mockResolvedValueOnce([{ toolSource: "builtin", toolId: "tool-1" }]); // Q2
    dbModule._sc.limit.mockResolvedValueOnce([{ agentId: "agent-1" }]);

    const result = await getAgentVersionToolContext("v1");
    expect(result.version.agentId).toBe("agent-1");
    expect(result.bindings).toHaveLength(1);
  });
});

describe("getCustomBindingContext", () => {
  it("returns null when binding not found", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([]);

    const result = await getCustomBindingContext("v1", "tool-1", "user-1", "ws-1");
    expect(result).toBeNull();
  });

  it("returns null when tool not found", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([{ toolSource: "custom", toolId: "tool-1" }]).mockResolvedValueOnce([]);

    const result = await getCustomBindingContext("v1", "tool-1", "user-1", "ws-1");
    expect(result).toBeNull();
  });

  it("returns binding and tool when both found", async () => {
    const binding = { toolSource: "custom", toolId: "tool-1" };
    const tool = { id: "tool-1", name: "My Tool" };
    dbModule._sc.limit.mockResolvedValueOnce([binding]).mockResolvedValueOnce([tool]);

    const result = await getCustomBindingContext("v1", "tool-1", "user-1", "ws-1");
    expect(result).not.toBeNull();
    expect(result?.binding).toEqual(binding);
    expect(result?.tool).toEqual(tool);
  });
});

describe("getMcpBindingContext", () => {
  it("returns null when binding not found", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([]);

    const result = await getMcpBindingContext("v1", "tool-1");
    expect(result).toBeNull();
  });

  it("returns null when tool not found", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([{ toolSource: "mcp", toolId: "tool-1" }]).mockResolvedValueOnce([]);

    const result = await getMcpBindingContext("v1", "tool-1");
    expect(result).toBeNull();
  });

  it("returns null when server not found", async () => {
    dbModule._sc.limit
      .mockResolvedValueOnce([{ toolSource: "mcp", toolId: "tool-1" }])
      .mockResolvedValueOnce([{ id: "tool-1", mcpServerId: "srv-1" }])
      .mockResolvedValueOnce([]);

    const result = await getMcpBindingContext("v1", "tool-1");
    expect(result).toBeNull();
  });

  it("returns binding, tool and server when all found", async () => {
    const binding = { toolSource: "mcp", toolId: "tool-1" };
    const tool = { id: "tool-1", mcpServerId: "srv-1" };
    const server = { id: "srv-1", name: "My Server" };
    dbModule._sc.limit.mockResolvedValueOnce([binding]).mockResolvedValueOnce([tool]).mockResolvedValueOnce([server]);

    const result = await getMcpBindingContext("v1", "tool-1");
    expect(result?.server).toEqual(server);
  });
});
