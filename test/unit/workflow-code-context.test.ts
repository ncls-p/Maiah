import { describe, expect, it } from "vitest";
import {
  workflowCodeContext,
  typescriptShape,
  pythonShape,
} from "@/components/workflows/workflow-code-context";
import type {
  WorkflowDefinition,
  WorkflowNode,
} from "@/modules/workflows/contracts";
const node = (
  id: string,
  type: WorkflowNode["type"],
  parameters: Record<string, unknown> = {},
): WorkflowNode => ({
  id,
  type,
  label: id,
  parameters,
  position: { x: 0, y: 0 },
  settings: { timeoutMs: 30000, maxRetries: 0, retryDelayMs: 1000 },
});
function graph(
  nodes: WorkflowNode[],
  defaultInput: WorkflowDefinition["defaultInput"] = {
    name: "Ada",
    obsolete: 1,
  },
): WorkflowDefinition {
  return {
    schemaVersion: 1,
    defaultInput,
    nodes,
    edges: nodes
      .slice(1)
      .map((n, i) => ({ id: `${i}`, source: nodes[i].id, target: n.id })),
  };
}
describe("browser workflow code context", () => {
  it("follows transformations across the entire incoming chain without executing code", () => {
    const definition = graph([
      node("start", "trigger.manual"),
      node("rename", "data.rename", { from: "name", to: "person.name" }),
      node("remove", "data.remove", { paths: ["obsolete"] }),
      node("split", "text.split", { outputPath: "items" }),
      node("code", "code.execute", {
        code: 'throw new Error("never execute")',
      }),
    ]);
    const context = workflowCodeContext(definition, "code");
    expect(typescriptShape(context.input)).toBe(
      '{ "person": { "name": string }; "items": Array<string> }',
    );
    expect(context.nodes).toHaveLength(5);
    expect(context.nodes.at(-1)?.output).toEqual({ kind: "unknown" });
    expect(pythonShape(context.input)).toContain('"items": list[str]');
  });
  it("does not invent globals from unrelated or downstream nodes", () => {
    const definition = graph([
      node("start", "trigger.manual"),
      node("code", "code.execute"),
      node("after", "data.set", { values: { secret: "x" } }),
    ]);
    expect(
      typescriptShape(workflowCodeContext(definition, "code").input),
    ).not.toContain("secret");
  });
  it("invalidates inferred fields when the upstream configuration changes", () => {
    const definition = graph([
      node("start", "trigger.manual"),
      node("set", "data.set", { values: { count: 1 } }),
      node("pick", "data.pick", { paths: ["count"] }),
      node("code", "code.execute"),
    ]);
    expect(typescriptShape(workflowCodeContext(definition, "code").input)).toBe(
      '{ "count": number }',
    );
    definition.nodes[1].parameters.values = { count: "one" };
    expect(typescriptShape(workflowCodeContext(definition, "code").input)).toBe(
      '{ "count": string }',
    );
  });
  it("keeps joins, cycles and arbitrary code outputs unknown", () => {
    const definition = graph([
      node("start", "trigger.manual"),
      node("a", "code.execute"),
      node("b", "code.execute"),
    ]);
    expect(workflowCodeContext(definition, "b").input).toEqual({
      kind: "unknown",
    });
    definition.edges.push({ id: "join", source: "start", target: "b" });
    expect(workflowCodeContext(definition, "b").input).toEqual({
      kind: "unknown",
    });
    definition.edges = [
      { id: "cycle1", source: "b", target: "a" },
      { id: "cycle2", source: "a", target: "b" },
    ];
    expect(() => workflowCodeContext(definition, "b")).not.toThrow();
  });
  it("quotes field names in virtual declarations rather than evaluating user text", () => {
    const definition = graph(
      [node("start", "trigger.manual"), node("code", "code.execute")],
      { 'a"; injected': true },
    );
    expect(typescriptShape(workflowCodeContext(definition, "code").input)).toBe(
      '{ "a\\"; injected": boolean }',
    );
  });
});
