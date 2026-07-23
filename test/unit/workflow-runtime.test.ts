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

  it("parses, renames, removes, picks, and stringifies structured data", async () => {
    const nodes = [
      ...createStarterDefinition().nodes,
      {
        id: "parse",
        type: "data.parseJson",
        label: "Parse",
        position: { x: 0, y: 0 },
        parameters: { path: "payload", outputPath: "parsed" },
        settings,
      },
      {
        id: "rename",
        type: "data.rename",
        label: "Rename",
        position: { x: 0, y: 0 },
        parameters: { from: "parsed.oldName", to: "parsed.name" },
        settings,
      },
      {
        id: "remove",
        type: "data.remove",
        label: "Remove",
        position: { x: 0, y: 0 },
        parameters: { paths: ["parsed.secret"] },
        settings,
      },
      {
        id: "pick",
        type: "data.pick",
        label: "Pick",
        position: { x: 0, y: 0 },
        parameters: { paths: ["parsed.name"] },
        settings,
      },
      {
        id: "stringify",
        type: "data.stringifyJson",
        label: "Stringify",
        position: { x: 0, y: 0 },
        parameters: { path: "parsed", outputPath: "json" },
        settings,
      },
    ];
    const edges = nodes.slice(1).map((current, index) => ({
      id: `edge-structure-${index}`,
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
      input: { payload: '{"oldName":"Ada","secret":true}' },
    });

    expect(result.status, JSON.stringify(result.errors)).toBe("completed");
    expect(result.context.stringify).toEqual({
      parsed: { name: "Ada" },
      json: '{"name":"Ada"}',
    });
  });

  it("rejects outgoing edges from terminal nodes", () => {
    const definition = createStarterDefinition();
    definition.nodes.push(
      {
        id: "stop",
        type: "logic.stop",
        label: "Stop",
        position: { x: 200, y: 0 },
        parameters: { message: "Done" },
        settings,
      },
      {
        id: "after",
        type: "data.set",
        label: "After",
        position: { x: 400, y: 0 },
        parameters: { values: { done: true } },
        settings,
      },
    );
    definition.edges.push(
      { id: "trigger-stop", source: "trigger", target: "stop" },
      { id: "stop-after", source: "stop", target: "after" },
    );

    expect(() => workflowDefinitionSchema.parse(definition)).toThrow(
      "cannot have outgoing edges",
    );
  });
});
