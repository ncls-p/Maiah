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

describe("workflow runtime", () => {

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
