import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/agent/runtime-executor", () => ({
  executeAgent: vi.fn(async () => ({
    runId: "agent-run",
    text: "done",
    inputTokens: 1,
    outputTokens: 1,
    totalTreeTokens: 2,
    reused: false,
  })),
}));

vi.mock("@/modules/tool/code-sandbox", () => ({
  executeCodeSandbox: vi.fn(async () => ({
    ok: true,
    stdout: '{"fromSandbox":true}',
    stderr: "",
  })),
}));

import {
  createStarterDefinition,
  workflowDefinitionSchema,
} from "@/modules/workflows/contracts";
import {
  compileWorkflowDefinition,
  createWorkflowRuntime,
} from "@/modules/workflows/runtime";

const settings = {
  timeoutMs: 30_000,
  maxRetries: 0,
  retryDelayMs: 1_000,
};

describe("workflow contracts", () => {
  it("creates a valid starter definition", () => {
    expect(workflowDefinitionSchema.parse(createStarterDefinition())).toEqual(
      createStarterDefinition(),
    );
  });

  it("requires exactly one trigger", () => {
    const definition = createStarterDefinition();
    definition.nodes.push({ ...definition.nodes[0]!, id: "trigger-two" });
    expect(() => workflowDefinitionSchema.parse(definition)).toThrow(
      "exactly one manual trigger",
    );
  });

  it("rejects graph cycles before execution", () => {
    const definition = {
      schemaVersion: 1 as const,
      nodes: [
        ...createStarterDefinition().nodes,
        {
          id: "set-a",
          type: "data.set" as const,
          label: "A",
          position: { x: 200, y: 0 },
          parameters: { values: { a: true } },
          settings,
        },
        {
          id: "set-b",
          type: "data.set" as const,
          label: "B",
          position: { x: 400, y: 0 },
          parameters: { values: { b: true } },
          settings,
        },
      ],
      edges: [
        { id: "one", source: "trigger", target: "set-a" },
        { id: "two", source: "set-a", target: "set-b" },
        { id: "three", source: "set-b", target: "set-a" },
      ],
    };
    expect(() =>
      compileWorkflowDefinition({
        workflowId: "workflow",
        version: 1,
        definition,
      }),
    ).toThrow("cycles are not supported");
  });
});

describe("workflow runtime", () => {
  it("executes a compiled data transformation", async () => {
    const definition = {
      schemaVersion: 1 as const,
      nodes: [
        ...createStarterDefinition().nodes,
        {
          id: "enrich",
          type: "data.set" as const,
          label: "Enrich",
          position: { x: 300, y: 180 },
          parameters: { values: { processed: true } },
          settings,
        },
      ],
      edges: [{ id: "trigger-enrich", source: "trigger", target: "enrich" }],
    };
    const { blueprint } = compileWorkflowDefinition({
      workflowId: "workflow",
      version: 1,
      definition,
    });
    const runtime = createWorkflowRuntime({
      dependencies: {
        workspaceId: "workspace",
        userId: "user",
        runId: "run",
      },
    });

    const result = await runtime.run(blueprint, {
      input: { message: "hello" },
    });

    expect(result.status, JSON.stringify(result.errors)).toBe("completed");
    expect(result.context.enrich).toEqual({
      message: "hello",
      processed: true,
    });
  });
});
