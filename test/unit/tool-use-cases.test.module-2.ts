import { describe, expect, it } from "vitest";

import {
  cloneToolBindings,
  insertToolBindingsForVersion,
  replaceToolBindingsForVersion,
} from "@/modules/tool/use-cases";
import { dbModule } from "./tool-use-cases.test.db-module";

describe("insertToolBindingsForVersion", () => {
  it("is a no-op for empty bindings array", async () => {
    await insertToolBindingsForVersion("v1", []);

    expect(dbModule.db.insert).not.toHaveBeenCalled();
    expect(dbModule.db.select).not.toHaveBeenCalled();
  });

  it("throws when custom tool not found", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([]);

    await expect(
      insertToolBindingsForVersion("v1", [
        { toolSource: "custom", toolId: crypto.randomUUID() },
      ]),
    ).rejects.toThrow("Custom tool not found");
  });

  it("throws when mcp tool not found", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([]);

    await expect(
      insertToolBindingsForVersion("v1", [
        {
          toolSource: "mcp",
          toolId: crypto.randomUUID(),
          mcpServerId: crypto.randomUUID(),
        },
      ]),
    ).rejects.toThrow("MCP tool not found");
  });

  it("throws when builtin tool not found", async () => {
    await expect(
      insertToolBindingsForVersion("v1", [
        { toolSource: "builtin", toolId: "nonexistent-tool-id" },
      ]),
    ).rejects.toThrow("Tool not found");
  });

  it("inserts custom and MCP tool bindings with workspace visibility", async () => {
    const customId = crypto.randomUUID();
    const mcpId = crypto.randomUUID();
    const serverId = crypto.randomUUID();
    dbModule._sc.limit
      .mockResolvedValueOnce([{ id: customId }])
      .mockResolvedValueOnce([{ requireApproval: false }]);

    await insertToolBindingsForVersion(
      "v1",
      [
        { toolSource: "custom", toolId: customId, requireApproval: false },
        { toolSource: "mcp", toolId: mcpId, mcpServerId: serverId },
      ],
      "ws-1",
      { userId: "user-1" },
    );

    expect(dbModule._ic.values).toHaveBeenCalledWith([
      expect.objectContaining({
        toolSource: "custom",
        toolId: customId,
        requireApproval: false,
      }),
      expect.objectContaining({
        toolSource: "mcp",
        toolId: mcpId,
        requireApproval: false,
      }),
    ]);
  });

  it("inserts builtin tool binding", async () => {
    // Use a real builtin tool ID from the catalog
    const CALCULATOR_ID = "00000000-0000-4000-8000-000000000001";
    await insertToolBindingsForVersion("v1", [
      { toolSource: "builtin", toolId: CALCULATOR_ID },
    ]);

    expect(dbModule.db.insert).toHaveBeenCalled();
    expect(dbModule._ic.onConflictDoNothing).toHaveBeenCalled();
  });
});

describe("replaceToolBindingsForVersion", () => {
  it("deletes existing bindings then inserts new ones", async () => {
    const CALCULATOR_ID = "00000000-0000-4000-8000-000000000001";
    await replaceToolBindingsForVersion("v1", [
      { toolSource: "builtin", toolId: CALCULATOR_ID },
    ]);

    expect(dbModule.db.delete).toHaveBeenCalled();
    expect(dbModule.db.insert).toHaveBeenCalled();
  });

  it("deletes existing bindings with empty new bindings", async () => {
    await replaceToolBindingsForVersion("v1", []);

    expect(dbModule.db.delete).toHaveBeenCalled();
    expect(dbModule.db.insert).not.toHaveBeenCalled();
  });
});

describe("cloneToolBindings", () => {
  it("is a no-op when fromAgentVersionId is null", async () => {
    await cloneToolBindings(null, "v2");

    expect(dbModule.db.select).not.toHaveBeenCalled();
  });

  it("skips mcp bindings where tool not found", async () => {
    // Get existing bindings: one mcp
    dbModule._sc.where.mockResolvedValueOnce([
      { toolSource: "mcp", toolId: "mcp-tool-1", requireApproval: false },
    ]);
    // Tool lookup returns empty
    dbModule._sc.limit.mockResolvedValueOnce([]);

    await cloneToolBindings("v1", "v2");

    // No bindings inserted because the mcp tool lookup failed
    expect(dbModule.db.insert).not.toHaveBeenCalled();
  });

  it("clones custom, MCP, and builtin bindings", async () => {
    const CALCULATOR_ID = "00000000-0000-4000-8000-000000000001";
    const mcpToolId = crypto.randomUUID();
    const serverId = crypto.randomUUID();
    dbModule._sc.where.mockResolvedValueOnce([
      {
        toolSource: "custom",
        toolId: crypto.randomUUID(),
        requireApproval: true,
      },
      { toolSource: "mcp", toolId: mcpToolId, requireApproval: false },
      { toolSource: "builtin", toolId: CALCULATOR_ID, requireApproval: false },
    ]);
    dbModule._sc.limit
      .mockResolvedValueOnce([{ mcpServerId: serverId }])
      .mockResolvedValueOnce([{ id: "custom-ok" }])
      .mockResolvedValueOnce([{ requireApproval: true }]);

    await cloneToolBindings("v1", "v2", "ws-1", { userId: "user-1" });

    expect(dbModule._ic.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ toolSource: "custom" }),
        expect.objectContaining({ toolSource: "mcp", toolId: mcpToolId }),
        expect.objectContaining({
          toolSource: "builtin",
          toolId: CALCULATOR_ID,
        }),
      ]),
    );
  });

  it("clones builtin bindings", async () => {
    const CALCULATOR_ID = "00000000-0000-4000-8000-000000000001";
    dbModule._sc.where.mockResolvedValueOnce([
      { toolSource: "builtin", toolId: CALCULATOR_ID, requireApproval: false },
    ]);

    await cloneToolBindings("v1", "v2");

    expect(dbModule.db.insert).toHaveBeenCalled();
  });
});
