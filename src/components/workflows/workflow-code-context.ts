import type { WorkflowDefinition } from "@/modules/workflows/contracts";

export type Shape =
  | { kind: "unknown" | "string" | "number" | "boolean" | "null" }
  | { kind: "array"; item: Shape }
  | { kind: "object"; fields: Record<string, Shape> };
const unknown: Shape = { kind: "unknown" };
const object = (fields: Record<string, Shape> = {}): Shape => ({
  kind: "object",
  fields,
});
function sample(value: unknown, depth = 0): Shape {
  if (depth > 8) return unknown;
  if (value === null) return { kind: "null" };
  if (typeof value === "string")
    return value.includes("{{") ? unknown : { kind: "string" };
  if (typeof value === "number" || typeof value === "boolean")
    return { kind: typeof value } as Shape;
  if (Array.isArray(value))
    return {
      kind: "array",
      item: value.length ? sample(value[0], depth + 1) : unknown,
    };
  if (value && typeof value === "object")
    return object(
      Object.fromEntries(
        Object.entries(value)
          .slice(0, 100)
          .map(([key, item]) => [key, sample(item, depth + 1)]),
      ),
    );
  return unknown;
}
function at(shape: Shape, path: string): Shape {
  return path
    .split(".")
    .filter(Boolean)
    .reduce(
      (current, key) =>
        current.kind === "object" ? (current.fields[key] ?? unknown) : unknown,
      shape,
    );
}
function put(shape: Shape, path: string, value: Shape): Shape {
  const [key, ...rest] = path.split(".").filter(Boolean);
  if (!key) return value;
  const fields = shape.kind === "object" ? shape.fields : {};
  return object({
    ...fields,
    [key]: put(fields[key] ?? unknown, rest.join("."), value),
  });
}
function remove(shape: Shape, path: string): Shape {
  const [key, ...rest] = path.split(".").filter(Boolean);
  if (shape.kind !== "object" || !key) return shape;
  const fields = { ...shape.fields };
  if (rest.length) fields[key] = remove(fields[key] ?? unknown, rest.join("."));
  else delete fields[key];
  return object(fields);
}
export function workflowCodeContext(
  definition: WorkflowDefinition,
  nodeId: string,
) {
  const memo = new Map<string, Shape>();
  const visiting = new Set<string>();
  function incoming(id: string): Shape {
    const edges = definition.edges.filter((e) => e.target === id);
    // A join is runtime-dependent: never pretend one branch is guaranteed.
    return edges.length === 1 ? output(edges[0].source) : unknown;
  }
  function output(id: string): Shape {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return unknown;
    visiting.add(id);
    const node = definition.nodes.find((n) => n.id === id);
    if (!node) return unknown;
    const p = node.parameters;
    let result = incoming(id);
    if (node.type === "trigger.manual")
      result = sample(definition.defaultInput);
    else if (node.type === "data.set") {
      const values = sample(p.values);
      result = object({
        ...(result.kind === "object" ? result.fields : {}),
        ...(values.kind === "object" ? values.fields : {}),
      });
    } else if (node.type === "data.pick")
      result = (Array.isArray(p.paths) ? p.paths : []).reduce<Shape>(
        (acc, key) => put(acc, String(key), at(result, String(key))),
        object(),
      );
    else if (node.type === "data.remove")
      result = (Array.isArray(p.paths) ? p.paths : []).reduce<Shape>(
        (acc, key) => remove(acc, String(key)),
        result,
      );
    else if (node.type === "data.rename")
      result = put(
        remove(result, String(p.from ?? "")),
        String(p.to ?? ""),
        at(result, String(p.from ?? "")),
      );
    else if (node.type === "http.request")
      result = object({
        status: { kind: "number" },
        headers: unknown,
        body: unknown,
      });
    else if (node.type === "agent.run")
      result = object({
        text: { kind: "string" },
        agentRunId: { kind: "string" },
      });
    else if (
      ["code.execute", "tool.call", "workflow.run", "logic.stop"].includes(
        node.type,
      )
    )
      result = unknown;
    else if (
      [
        "data.template",
        "data.stringifyJson",
        "text.transform",
        "list.join",
        "date.now",
      ].includes(node.type)
    )
      result = put(result, String(p.outputPath ?? ""), { kind: "string" });
    else if (node.type === "number.calculate")
      result = put(result, String(p.outputPath ?? ""), { kind: "number" });
    else if (node.type === "text.split")
      result = put(result, String(p.outputPath ?? ""), {
        kind: "array",
        item: { kind: "string" },
      });
    else if (node.type === "data.parseJson")
      result = put(result, String(p.outputPath ?? ""), unknown);
    else if (node.type.startsWith("list."))
      result = put(
        result,
        String(p.outputPath ?? ""),
        at(result, String(p.path ?? "")),
      );
    visiting.delete(id);
    memo.set(id, result);
    return result;
  }
  const input = incoming(nodeId);
  return {
    input,
    nodes: definition.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      input: incoming(node.id),
      output: output(node.id),
      code:
        node.type === "code.execute"
          ? String(node.parameters.code ?? "")
          : undefined,
      language: String(node.parameters.language ?? "node"),
    })),
    edges: definition.edges.map(({ source, target }) => ({ source, target })),
  };
}
export type WorkflowCodeContext = ReturnType<typeof workflowCodeContext>;
export function typescriptShape(shape: Shape): string {
  if (shape.kind === "array") return `Array<${typescriptShape(shape.item)}>`;
  if (shape.kind === "object")
    return `{ ${Object.entries(shape.fields)
      .map(
        ([key, value]) => `${JSON.stringify(key)}: ${typescriptShape(value)}`,
      )
      .join("; ")} }`;
  return shape.kind;
}
export function pythonShape(shape: Shape): string {
  const declarations: string[] = ["from typing import Any, TypedDict"];
  function render(value: Shape): string {
    if (value.kind === "array") return `list[${render(value.item)}]`;
    if (value.kind === "object") {
      const entries = Object.entries(value.fields).map(
        ([key, item]) => `${JSON.stringify(key)}: ${render(item)}`,
      );
      const name = `WorkflowData${declarations.length}`;
      declarations.push(
        `${name} = TypedDict(${JSON.stringify(name)}, {${entries.join(", ")}})`,
      );
      return name;
    }
    return {
      unknown: "Any",
      string: "str",
      number: "float",
      boolean: "bool",
      null: "None",
    }[value.kind];
  }
  const name = render(shape);
  return `${declarations.join("\n")}\nInput = ${name}\n`;
}
