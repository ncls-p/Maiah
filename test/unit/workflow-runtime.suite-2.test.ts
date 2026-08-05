import { describe,expect,it,vi } from "vitest";

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
createStarterDefinition
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
          parameters: { values: { "": "unfinished row", processed: true } },
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
        workflowId: "workflow",
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
    expect(Object.hasOwn(result.context.enrich as object, "")).toBe(false);
  });

  it("captures a debug snapshot without changing downstream data", async () => {
    const definition = {
      schemaVersion: 1 as const,
      nodes: [
        ...createStarterDefinition().nodes,
        {
          id: "debug",
          type: "debug.snapshot" as const,
          label: "Inspect payload",
          position: { x: 300, y: 180 },
          parameters: { note: "Check the incoming message" },
          settings,
        },
      ],
      edges: [{ id: "trigger-debug", source: "trigger", target: "debug" }],
    };
    const { blueprint } = compileWorkflowDefinition({
      workflowId: "workflow",
      version: 1,
      definition,
    });
    const runtime = createWorkflowRuntime({
      dependencies: {
        workspaceId: "workspace",
        workflowId: "workflow",
        userId: "user",
        runId: "run",
      },
    });

    const input = { message: "hello", nested: { count: 2 } };
    const result = await runtime.run(blueprint, { input });

    expect(result.status, JSON.stringify(result.errors)).toBe("completed");
    expect(result.context.debug).toEqual(input);
  });

  it("executes no-code text, number, list, date, delay, and terminal nodes", async () => {
    const node = (
      id: string,
      type: string,
      parameters: Record<string, unknown>,
    ) => ({
      id,
      type,
      label: id,
      position: { x: 0, y: 0 },
      parameters,
      settings,
    });
    const nodes = [
      ...createStarterDefinition().nodes,
      node("template", "data.template", {
        template: "Bonjour {{name}}",
        outputPath: "greeting",
      }),
      node("uppercase", "text.transform", {
        path: "greeting",
        operation: "uppercase",
        outputPath: "greeting",
      }),
      node("calculate", "number.calculate", {
        path: "amount",
        operation: "add",
        operand: 5,
        outputPath: "total",
      }),
      node("filter", "list.filter", {
        path: "items",
        field: "active",
        operator: "equals",
        value: true,
        outputPath: "filtered",
      }),
      node("sort", "list.sort", {
        path: "filtered",
        field: "score",
        direction: "descending",
        outputPath: "sorted",
      }),
      node("slice", "list.slice", {
        path: "sorted",
        start: 0,
        limit: 1,
        outputPath: "top",
      }),
      node("delay", "logic.delay", { delayMs: 0 }),
      node("date", "date.now", { format: "date", outputPath: "today" }),
      node("stop", "logic.stop", { message: "Fini pour {{name}}" }),
    ];
    const edges = nodes.slice(1).map((current, index) => ({
      id: `edge-${index}`,
      source: nodes[index]!.id,
      target: current.id,
    }));
    const { blueprint } = compileWorkflowDefinition({
      workflowId: "workflow",
      version: 1,
      definition: { schemaVersion: 1, nodes, edges },
    });
    const runtime = createWorkflowRuntime({
      dependencies: {
        workspaceId: "workspace",
        workflowId: "workflow",
        userId: "user",
        runId: "run",
      },
    });

    const result = await runtime.run(blueprint, {
      input: {
        name: "Ada",
        amount: 10,
        items: [
          { active: true, score: 2 },
          { active: false, score: 99 },
          { active: true, score: 12 },
        ],
      },
    });

    expect(result.status, JSON.stringify(result.errors)).toBe("completed");
    expect(result.context.stop).toMatchObject({
      greeting: "BONJOUR ADA",
      total: 15,
      top: [{ active: true, score: 12 }],
      workflowResult: "Fini pour Ada",
    });
    expect((result.context.stop as { today: string }).today).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});
