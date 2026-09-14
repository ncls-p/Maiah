import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  mcp: vi.fn(),
  custom: vi.fn(),
  mcpContext: vi.fn(),
  customContext: vi.fn(),
  policy: vi.fn(),
  opa: vi.fn(),
  log: vi.fn(),
  restricted: vi.fn(),
}));
vi.mock("@/server/infrastructure/db", () => ({ db: {} }));
vi.mock("@/modules/mcp/executor", () => ({ executeMcpTool: mocks.mcp }));
vi.mock("@/modules/custom-tools/use-cases", () => ({
  executeCustomToolWorkflow: mocks.custom,
}));
vi.mock("@/modules/tool/use-cases", () => ({
  getAvailableMcpToolContext: mocks.mcpContext,
  getAvailableCustomToolContext: mocks.customContext,
  logToolInvocation: mocks.log,
  canExecuteRestrictedTool: mocks.restricted,
}));
vi.mock("@/modules/tool/organization-builtin-tool-policies", () => ({
  getOrganizationBuiltInToolPolicyMap: mocks.policy,
}));
vi.mock("@/modules/tool/opa-approval-policy", () => ({
  evaluateOpaToolApprovalPolicy: mocks.opa,
}));
vi.mock("@/modules/tool/invocation-state", () => ({
  waitForApproval: vi.fn(() => {
    throw new Error("No interactive wait expected");
  }),
}));
import { executeWorkflowTool } from "@/modules/workflows/execute-tool";
import { createStarterDefinition } from "@/modules/workflows/contracts";
import {
  compileWorkflowDefinition,
  createWorkflowRuntime,
} from "@/modules/workflows/runtime";
import {
  getBuiltInToolByName,
  listBuiltInTools,
} from "@/modules/tool/builtin-tools";
import { z } from "zod";
const toolId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const context = { workspaceId: "workspace", userId: "initiator" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.policy.mockResolvedValue(new Map());
  mocks.opa.mockResolvedValue(null);
  mocks.restricted.mockResolvedValue(true);
  mocks.log.mockResolvedValue({ id: "invocation" });
  mocks.mcp.mockResolvedValue({ number: "REQ001" });
  mocks.mcpContext.mockResolvedValue({
    tool: {
      id: toolId,
      name: "order",
      mcpServerId: "server",
      requireApproval: false,
      inputSchemaJson: {
        type: "object",
        properties: { quantity: { type: "integer", minimum: 1 } },
        required: ["quantity"],
        additionalProperties: false,
      },
    },
    server: { requireApproval: false },
  });
});
describe("direct workflow tool execution", () => {
  it("uses the initiating user's MCP context and the selected connection", async () => {
    expect(
      await executeWorkflowTool({
        ...context,
        parameters: {
          source: "mcp",
          toolId,
          connectionId,
          arguments: { quantity: 2 },
        },
      }),
    ).toEqual({ number: "REQ001" });
    expect(mocks.mcpContext).toHaveBeenCalledWith(
      toolId,
      "initiator",
      "workspace",
    );
    expect(mocks.mcp).toHaveBeenCalledWith(
      expect.objectContaining({
        ...context,
        connectionId,
        toolInput: { quantity: 2 },
      }),
    );
  });
  it("rejects invalid arguments before any remote action", async () => {
    await expect(
      executeWorkflowTool({
        ...context,
        parameters: { source: "mcp", toolId, arguments: { quantity: "2" } },
      }),
    ).rejects.toThrow("Invalid workflow tool arguments");
    expect(mocks.mcp).not.toHaveBeenCalled();
  });
  it("fails a step when permission or approval denies execution", async () => {
    mocks.mcpContext.mockResolvedValueOnce(null);
    await expect(
      executeWorkflowTool({
        ...context,
        parameters: { source: "mcp", toolId, arguments: { quantity: 1 } },
      }),
    ).rejects.toThrow("inaccessible");
    mocks.opa.mockResolvedValue({ status: "require_approval" });
    await expect(
      executeWorkflowTool({
        ...context,
        parameters: { source: "mcp", toolId, arguments: { quantity: 1 } },
      }),
    ).rejects.toThrow("denied");
    expect(mocks.mcp).not.toHaveBeenCalled();
  });
  it("does not dispatch after cancellation", async () => {
    await expect(
      executeWorkflowTool({
        ...context,
        signal: AbortSignal.abort(),
        parameters: { source: "mcp", toolId, arguments: { quantity: 1 } },
      }),
    ).rejects.toThrow();
    expect(mocks.mcp).not.toHaveBeenCalled();
  });
  it("provides real JSON schemas for every built-in tool", () => {
    for (const tool of listBuiltInTools())
      expect(() =>
        z.toJSONSchema(getBuiltInToolByName(tool.name)!.inputSchema, {
          io: "input",
        }),
      ).not.toThrow();
  });
  it("executes a graph with typed variables and a reusable output field without an assistant", async () => {
    const definition = createStarterDefinition();
    definition.nodes.push({
      id: "order",
      type: "tool.call",
      label: "Order",
      position: { x: 200, y: 0 },
      parameters: {
        source: "mcp",
        toolId,
        connectionId,
        arguments: { quantity: "{{quantity}}" },
        outputPath: "request",
      },
      settings: { timeoutMs: 30000, maxRetries: 0, retryDelayMs: 1000 },
    });
    definition.edges.push({
      id: "to-order",
      source: "trigger",
      target: "order",
    });
    const { blueprint } = compileWorkflowDefinition({
      workflowId: "workflow",
      version: 1,
      definition,
    });
    const result = await createWorkflowRuntime({
      dependencies: { ...context, workflowId: "workflow", runId: "run" },
    }).run(blueprint, { input: { quantity: 3 } });
    expect(result.status).toBe("completed");
    expect(mocks.mcp).toHaveBeenCalledWith(
      expect.objectContaining({ toolInput: { quantity: 3 }, connectionId }),
    );
    expect(JSON.stringify(result.context)).toContain("REQ001");
    definition.nodes[1]!.settings.maxRetries = 1;
    expect(() =>
      compileWorkflowDefinition({
        workflowId: "workflow",
        version: 1,
        definition,
      }),
    ).toThrow("automatic retries");
  });
});
