import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  connector: vi.fn(),
  settings: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  decrypt: vi.fn(async () => ({ password: "secret" })),
  view: vi.fn(),
}));
vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.limit, orderBy: mocks.orderBy }),
      }),
    }),
  },
}));
vi.mock(
  "@/modules/tool-connections/use-cases.upsert-tool-connection-requirement",
  () => ({
    findConnectorForTool: mocks.connector,
    findUserToolSettings: mocks.settings,
  }),
);
vi.mock(
  "@/modules/tool-connections/use-cases.mcp-tool-source",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/modules/tool-connections/use-cases.mcp-tool-source")
    >()),
    decryptRecord: mocks.decrypt,
    canViewConnection: mocks.view,
  }),
);
import { resolveToolExecutionHeaders } from "@/modules/tool-connections/use-cases.build-signed-tool-context-headers";
const input = {
  workspaceId: "workspace",
  userId: "alice",
  toolId: "tool",
  toolSource: "mcp",
  mcpServerId: "server",
  connectionId: "selected",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connector.mockResolvedValue({
    connector: { id: "connector", key: "servicenow" },
    required: true,
  });
  mocks.settings.mockResolvedValue(null);
  mocks.view.mockResolvedValue(true);
  mocks.limit.mockResolvedValue([
    {
      id: "selected",
      connectorId: "connector",
      ownerType: "user",
      encryptedSecretsJson: { password: "encrypted" },
    },
  ]);
});
describe("explicit workflow MCP connection", () => {
  it("uses only selected credentials, without fallback or per-tool secret overrides", async () => {
    mocks.settings.mockResolvedValue({
      enabled: true,
      connectionId: "old",
      encryptedSecretsJson: { password: "wrong-mode" },
    });
    expect(Object.keys(await resolveToolExecutionHeaders(input))).toHaveLength(
      2,
    );
    expect(mocks.decrypt).toHaveBeenCalledTimes(1);
    expect(mocks.decrypt).toHaveBeenCalledWith({ password: "encrypted" });
    expect(mocks.orderBy).not.toHaveBeenCalled();
  });
  it("rejects deleted, inaccessible and wrong-connector selections without fallback", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    await expect(resolveToolExecutionHeaders(input)).rejects.toThrow(
      "unavailable",
    );
    mocks.view.mockResolvedValueOnce(false);
    await expect(resolveToolExecutionHeaders(input)).rejects.toThrow(
      "unavailable",
    );
    mocks.limit.mockResolvedValueOnce([
      { id: "selected", ownerType: "workspace", connectorId: "other" },
    ]);
    await expect(resolveToolExecutionHeaders(input)).rejects.toThrow(
      "incompatible",
    );
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it("rejects a selected connection when the connector is disabled or removed", async () => {
    mocks.connector.mockResolvedValue({ connector: null, required: false });
    await expect(resolveToolExecutionHeaders(input)).rejects.toThrow(
      "connector",
    );
  });
});
