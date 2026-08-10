import { describe, expect, it } from "vitest";

import { updateMcpTool } from "@/modules/mcp/use-cases";
import {
  dbModule,
  fakeSseServer,
  fakeTool,
} from "./mcp-use-cases.test.db-module";

// ─── updateMcpTool ────────────────────────────────────────────────────

describe("updateMcpTool", () => {
  it("throws when server not found", async () => {
    await expect(
      updateMcpTool({
        toolId: "tool-1",
        serverId: "srv-1",
        workspaceId: "ws-1",
        userId: "user-1",
        enabled: true,
      }),
    ).rejects.toThrow("MCP server not found");
  });

  it("throws when no updates provided", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);

    await expect(
      updateMcpTool({
        toolId: "tool-1",
        serverId: "srv-1",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("No updates provided");
  });

  it("throws when tool not found after update", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    // update().returning() returns empty
    dbModule._c.returning.mockResolvedValueOnce([]);

    await expect(
      updateMcpTool({
        toolId: "tool-1",
        serverId: "srv-1",
        workspaceId: "ws-1",
        userId: "user-1",
        enabled: true,
      }),
    ).rejects.toThrow("MCP tool not found");
  });

  it("returns updated tool", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    dbModule._c.returning.mockResolvedValueOnce([
      { ...fakeTool, enabled: false },
    ]);

    const result = await updateMcpTool({
      toolId: "tool-1",
      serverId: "srv-1",
      workspaceId: "ws-1",
      userId: "user-1",
      enabled: false,
      requireApproval: true,
    });

    expect(result).toEqual({ ...fakeTool, enabled: false });
  });
});
