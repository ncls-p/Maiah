import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  connector: vi.fn(),
  settings: vi.fn(),
  preferred: vi.fn(),
  available: vi.fn(),
  rows: vi.fn(),
}));
vi.mock("@/server/infrastructure/db", () => ({
  db: { select: () => ({ from: () => ({ where: mocks.rows }) }) },
}));
vi.mock(
  "@/modules/tool-connections/use-cases.upsert-tool-connection-requirement",
  () => ({
    findConnectorForTool: mocks.connector,
    findUserToolSettings: mocks.settings,
  }),
);
vi.mock(
  "@/modules/tool-connections/use-cases.build-signed-tool-context-headers",
  () => ({
    findPreferredConnection: mocks.preferred,
    listToolExecutionConnections: mocks.available,
  }),
);
import {
  getAssistantConnections,
  getServerConnectionRestrictions,
} from "@/modules/tool-connections/assistant-connections";
const input = {
  workspaceId: "workspace",
  userId: "alice",
  toolId: "tool",
  mcpServerId: "server",
  toolSource: "mcp",
};
const available = [
  { id: "a", label: "A", instanceUrl: "https://a.service-now.com" },
  { id: "b", label: "B", instanceUrl: "https://b.service-now.com" },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connector.mockResolvedValue({
    connector: { id: "connector", key: "servicenow" },
  });
  mocks.available.mockResolvedValue(available);
  mocks.preferred.mockResolvedValue(available[0]);
  mocks.settings.mockResolvedValue(null);
});
describe("assistant connection authorization", () => {
  it("does not route non-ServiceNow tools", async () => {
    mocks.connector.mockResolvedValue({ connector: null });
    expect(await getAssistantConnections(input)).toBeNull();
    mocks.connector.mockResolvedValue({ connector: { key: "other" } });
    expect(await getAssistantConnections(input, ["a"])).toEqual([]);
    expect(mocks.available).not.toHaveBeenCalled();
  });
  it("retains only the legacy preferred connection until the assistant is configured", async () => {
    expect(await getAssistantConnections(input)).toEqual([available[0]]);
    expect(await getAssistantConnections(input, null, ["b"])).toEqual([]);
    mocks.preferred.mockResolvedValue(null);
    expect(await getAssistantConnections(input)).toEqual([]);
  });
  it("supports multiple explicit connections without falling back after revocation or deselection", async () => {
    expect(
      await getAssistantConnections(input, ["a", "b"], ["b", "foreign"]),
    ).toEqual([available[1]]);
    expect(await getAssistantConnections(input, ["revoked"])).toEqual([]);
    expect(await getAssistantConnections(input, [], ["a"])).toEqual([]);
    expect(mocks.preferred).not.toHaveBeenCalled();
  });
  it("conversation-added MCP tools inherit server restrictions", async () => {
    expect(await getServerConnectionRestrictions([])).toEqual(new Map());
    mocks.rows.mockResolvedValue([
      { id: "first", serverId: "server" },
      { id: "second", serverId: "server" },
      { id: "third", serverId: "disabled" },
    ]);
    const result = await getServerConnectionRestrictions([
      { toolSource: "mcp", toolId: "first", connectionIds: ["a"] },
      { toolSource: "mcp", toolId: "second", connectionIds: ["a", "b"] },
      { toolSource: "mcp", toolId: "third", connectionIds: [] },
    ]);
    expect(result.get("server")).toEqual(["a", "b"]);
    expect(result.get("disabled")).toEqual([]);
  });
});
