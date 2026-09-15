import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  execute: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/crypto", () => ({ decryptValue: mocks.decrypt }));
vi.mock("@/modules/mcp/executor", () => ({ executeMcpTool: mocks.execute }));
vi.mock("@/modules/custom-tools/use-cases", () => ({
  executeCustomToolWorkflow: vi.fn(),
}));
vi.mock("@/modules/tool/builtin-tools", () => ({ getBuiltInTool: vi.fn() }));
vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ mcpServerId: "server" }] }),
      }),
    }),
  },
}));
import { executeInvocation } from "@/app/api/workspace/tool-invocations/[invocationId]/approve/route.invocation-execution-error";

describe("approved MCP connection routing", () => {
  const invocation = {
    toolSource: "mcp",
    toolId: "tool",
    workspaceId: "workspace",
    inputJsonEncrypted: "encrypted",
  } as Parameters<typeof executeInvocation>[0];
  it("retains the selected target after human approval and sends only original arguments", async () => {
    mocks.decrypt.mockResolvedValue(
      JSON.stringify({
        maiahConnectionRouting: 1,
        connectionId: "production",
        connectionLabel: "Production",
        instanceUrl: "https://production.service-now.com",
        arguments: { short_description: "Example" },
      }),
    );
    await executeInvocation(invocation, "user");
    expect(mocks.execute).toHaveBeenLastCalledWith({
      serverId: "server",
      toolId: "tool",
      workspaceId: "workspace",
      userId: "user",
      connectionId: "production",
      expectedInstanceUrl: "https://production.service-now.com",
      toolInput: { short_description: "Example" },
    });
  });
  it("preserves ordinary MCP inputs without a routing envelope", async () => {
    mocks.decrypt.mockResolvedValue(JSON.stringify({ query: "Example" }));
    await executeInvocation(invocation, "user");
    expect(mocks.execute).toHaveBeenLastCalledWith({
      serverId: "server",
      toolId: "tool",
      workspaceId: "workspace",
      userId: "user",
      toolInput: { query: "Example" },
    });
  });
});
