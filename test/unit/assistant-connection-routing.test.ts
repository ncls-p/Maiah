import { describe, expect, it, vi } from "vitest";
import { routeConnectionTool } from "@/app/api/workspace/[agentId]/chat/route-support.connection-tool";
import {
  safeInstanceUrl,
  selectExecutionConnections,
} from "@/modules/tool-connections/connection-selection";

const connections = [
  {
    id: "prod",
    label: "Production",
    instanceUrl: "https://prod.service-now.com",
  },
  { id: "test", label: "Test", instanceUrl: "https://test.service-now.com" },
];

describe("assistant and conversation connection routing", () => {
  it("intersects accessible, assistant-authorized and conversation-active connections", () => {
    expect(
      selectExecutionConnections(
        connections,
        ["prod"],
        ["test", "prod", "foreign"],
      ),
    ).toEqual([connections[0]]);
    expect(selectExecutionConnections(connections, ["revoked"])).toEqual([]);
    expect(selectExecutionConnections(connections, [])).toEqual([]);
    expect(selectExecutionConnections(connections, ["prod"], [])).toEqual([]);
    expect(selectExecutionConnections(connections, ["prod", "test"])).toEqual(
      connections,
    );
  });

  it("exposes names and target URLs and strips routing before calling the upstream tool", async () => {
    const execute = vi.fn(async () => ({ number: "INC001" }));
    const factory = vi.fn(() => execute);
    const tool = routeConnectionTool(
      connections,
      { type: "object" },
      { description: "Create incident", inputSchema: {}, execute: factory },
    );
    expect(tool.description).toContain("Production");
    expect(tool.description).toContain("https://prod.service-now.com");
    await (tool.execute as (input: unknown) => Promise<unknown>)({
      connectionId: "test",
      arguments: { short_description: "Example" },
    });
    expect(factory).toHaveBeenCalledWith({
      connectionId: "test",
      connectionLabel: "Test",
      expectedInstanceUrl: "https://test.service-now.com",
    });
    expect(execute).toHaveBeenCalledWith({ short_description: "Example" });
  });

  it("rejects forged or missing routing without dispatching", async () => {
    const factory = vi.fn(() => vi.fn());
    const tool = routeConnectionTool(
      [connections[0]],
      {},
      { description: "Incident", inputSchema: {}, execute: factory },
    );
    const execute = tool.execute as (input: unknown) => Promise<unknown>;
    await expect(
      execute({ connectionId: "test", arguments: {} }),
    ).rejects.toThrow("not authorized");
    await expect(execute({ arguments: {} })).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });

  it("preserves the input contract of other MCP connectors", async () => {
    const execute = vi.fn(async () => "ok");
    const tool = routeConnectionTool(
      null,
      { type: "object" },
      { description: "Other", inputSchema: {}, execute: () => execute },
    );
    await (tool.execute as (input: unknown) => Promise<unknown>)({ value: 1 });
    expect(execute).toHaveBeenCalledWith({ value: 1 });
  });

  it("never publishes embedded credentials or query tokens as connection metadata", () => {
    expect(
      safeInstanceUrl("https://test.service-now.com/?token=secret#private"),
    ).toBe("https://test.service-now.com");
    for (const value of [
      null,
      "broken",
      "http://host",
      "https://user:password@host",
    ])
      expect(safeInstanceUrl(value)).toBeNull();
  });
});
