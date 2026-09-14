import type { WorkflowDefinition } from "@/modules/workflows/contracts";
import { objectValue } from "@/modules/workflows/runtime.workflow-runtime-dependencies";
export type WorkflowVariable = {
  path: string;
  label: string;
  example?: unknown;
};

export function workflowVariables(
  definition: WorkflowDefinition,
  nodeId: string,
): WorkflowVariable[] {
  const variables: WorkflowVariable[] = [{ path: "input", label: "input" }];
  const seen = new Set<string>([nodeId]);
  function addValue(value: unknown, prefix: string, label: string, depth = 0) {
    if (prefix) variables.push({ path: prefix, label, example: value });
    if (depth >= 4) return;
    for (const [key, child] of Object.entries(objectValue(value)).slice(
      0,
      50,
    )) {
      if (
        !/^[A-Za-z0-9_-]+$/.test(key) ||
        ["__proto__", "constructor", "prototype"].includes(key)
      )
        continue;
      addValue(
        child,
        prefix ? `${prefix}.${key}` : key,
        `${label} · ${key}`,
        depth + 1,
      );
    }
  }
  let current = nodeId;
  while (true) {
    const incoming = definition.edges.filter((edge) => edge.target === current);
    if (incoming.length !== 1) break;
    const source = definition.nodes.find(
      (node) => node.id === incoming[0]!.source,
    );
    if (!source || seen.has(source.id)) break;
    seen.add(source.id);
    if (source.type === "trigger.manual") {
      addValue(definition.defaultInput, "", source.label);
      break;
    }
    if (source.type === "agent.run") {
      variables.push(
        { path: "text", label: `${source.label} · text` },
        { path: "agentRunId", label: `${source.label} · agentRunId` },
      );
      break;
    }
    if (source.type === "http.request") {
      variables.push(
        { path: "body", label: `${source.label} · body` },
        { path: "status", label: `${source.label} · status` },
      );
      break;
    }
    const path = source.parameters.outputPath;
    if (typeof path === "string" && path)
      variables.push({ path, label: `${source.label} · ${path}` });
    if (source.type === "data.set")
      addValue(source.parameters.values, "", source.label);
    if (
      [
        "code.execute",
        "data.pick",
        "data.remove",
        "data.rename",
        "logic.stop",
      ].includes(source.type)
    )
      break;
    current = source.id;
  }
  return [
    ...new Map(variables.map((variable) => [variable.path, variable])).values(),
  ];
}
