import { describe,expect,it,vi } from "vitest";

import { compileWorkflowDefinition,createWorkflowEventBus,createWorkflowRuntime,workflowNodeById } from "@/modules/workflows/runtime";
import { definitionWith,dependencies,node } from "./workflow-runtime-coverage.test.dependencies";

describe("workflow compilation validation and utilities", () => {
  it("builds blueprint configuration and exposes runtime helpers", async () => {
    const definition = definitionWith(node("data.set", { values: { done: true } }));
    definition.edges[0]!.sourceHandle = "true";
    const compiled = compileWorkflowDefinition({
      workflowId: "workflow-1",
      version: 3,
      definition,
    });
    expect(compiled.blueprint).toMatchObject({
      id: "workflow-1@3",
      metadata: { version: "3", schemaVersion: 1 },
      edges: [{ source: "trigger", target: "node-data-set", action: "true" }],
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: "node-data-set",
          config: { timeout: 30_000, maxRetries: 1, retryDelay: 1_000 },
        }),
      ]),
    });
    expect(createWorkflowRuntime({ dependencies })).toBeDefined();
    expect(workflowNodeById(definition, "node-data-set")?.type).toBe("data.set");
    expect(workflowNodeById(definition, "missing")).toBeUndefined();
    const emit = vi.fn();
    await createWorkflowEventBus(emit).emit({
      type: "workflow:start",
      payload: {},
    } as never);
    expect(emit).toHaveBeenCalled();
  });

  it.each([
    ["agent.run", { agentId: "invalid", prompt: "Do it" }, "valid agent"],
    ["agent.run", { agentId: "11111111-1111-4111-8111-111111111111", prompt: "" }, "instruction"],
    ["http.request", { url: "not-a-url" }, "valid HTTPS URL"],
    ["http.request", { url: "http://example.test" }, "valid HTTPS URL"],
    ["code.execute", { language: "ruby", code: "puts 1" }, "code language"],
    ["code.execute", { language: "node", code: "" }, "requires code"],
    ["data.pick", { paths: [] }, "field paths"],
    ["data.remove", { paths: [""] }, "field paths"],
    ["data.rename", { from: "", to: "target" }, "source and target"],
    ["data.template", { template: "value", outputPath: "" }, "output path"],
    ["logic.delay", { delayMs: 60_001 }, "delay under 60 seconds"],
    ["logic.condition", { path: "" }, "field path"],
  ] as const)("rejects invalid %s parameters", (type, parameters, message) => {
    expect(() =>
      compileWorkflowDefinition({
        workflowId: "workflow-1",
        version: 1,
        definition: definitionWith(node(type, { ...parameters })),
      }),
    ).toThrow(message);
  });

  it("enforces HTTP, code, and data size limits", () => {
    expect(() =>
      compileWorkflowDefinition({
        workflowId: "workflow",
        version: 1,
        definition: definitionWith(
          node("http.request", {
            url: "https://example.test",
            headers: Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`x-${index}`, "value"])),
          }),
        ),
      }),
    ).toThrow("too many HTTP headers");
    expect(() =>
      compileWorkflowDefinition({
        workflowId: "workflow",
        version: 1,
        definition: definitionWith(
          node("code.execute", {
            language: "node",
            code: "x".repeat(100_001),
          }),
        ),
      }),
    ).toThrow("under 100,000 characters");
    expect(() =>
      compileWorkflowDefinition({
        workflowId: "workflow",
        version: 1,
        definition: definitionWith(
          node("data.set", {
            values: Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`field-${index}`, index])),
          }),
        ),
      }),
    ).toThrow("too many fields");
  });
});
