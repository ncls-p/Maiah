import { afterEach, beforeEach, vi } from "vitest";

import { lookup } from "node:dns/promises";

import { executeAgent } from "@/modules/agent/runtime-executor";
import { executeCodeSandbox } from "@/modules/tool/code-sandbox";
import {
  createStarterDefinition,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowNodeType,
} from "@/modules/workflows/contracts";
import { WORKFLOW_NODE_REGISTRY } from "@/modules/workflows/runtime";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

vi.mock("@/modules/agent/runtime-executor", () => ({
  executeAgent: vi.fn(),
}));

vi.mock("@/modules/tool/code-sandbox", () => ({
  executeCodeSandbox: vi.fn(),
}));

export const dependencies = {
  workspaceId: "workspace-1",
  workflowId: "workflow-1",
  userId: "user-1",
  runId: "run-1",
};

const settings = {
  timeoutMs: 30_000,
  maxRetries: 0,
  retryDelayMs: 1_000,
};

export async function invokeNode(
  type: WorkflowNodeType,
  input: unknown,
  params: Record<string, unknown> = {},
  extras: Record<string, unknown> = {},
) {
  const handler = WORKFLOW_NODE_REGISTRY[type] as unknown as (
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  return handler({
    input,
    params,
    dependencies,
    context: { get: vi.fn().mockResolvedValue(input) },
    signal: undefined,
    ...extras,
  });
}

export function definitionWith(node: WorkflowNode): WorkflowDefinition {
  return {
    schemaVersion: 1,
    defaultInput: { message: "Bonjour" },
    nodes: [...createStarterDefinition().nodes, node],
    edges: [{ id: "edge", source: "trigger", target: node.id }],
  };
}

export function node(
  type: WorkflowNodeType,
  parameters: Record<string, unknown>,
): WorkflowNode {
  return {
    id: `node-${type.replace(".", "-")}`,
    type,
    label: type,
    position: { x: 100, y: 100 },
    parameters,
    settings,
  };
}

beforeEach(() => {
  vi.mocked(lookup)
    .mockReset()
    .mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
  vi.mocked(executeCodeSandbox)
    .mockReset()
    .mockResolvedValue({
      ok: true,
      stdout: '{"ok":true}',
      stderr: "",
    } as never);
  vi.mocked(executeAgent)
    .mockReset()
    .mockResolvedValue({
      runId: "agent-run-1",
      text: "Agent answer",
      inputTokens: 1,
      outputTokens: 2,
      totalTreeTokens: 3,
      reused: false,
    } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});
