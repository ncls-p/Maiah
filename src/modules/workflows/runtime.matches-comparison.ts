import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { setTimeout as wait } from "node:timers/promises";

import {
  FlowRuntime,
  lintBlueprint,
  type FlowcraftEvent,
  type IEventBus,
  type NodeFunction,
  type WorkflowBlueprint,
} from "flowcraft";

import { executeAgent } from "@/modules/agent/runtime-executor";
import {
  executeCodeSandbox,
  type CodeSandboxResult,
} from "@/modules/tool/code-sandbox";

import {
  isWorkflowSecretReference,
  resolveWorkflowSecretReferences,
} from "./agentic-history";
import {
  workflowDefinitionSchema,
  type WorkflowDefinition,
  type WorkflowNode,
} from "./contracts";
import {
  RuntimeContext,
  WorkflowRuntimeDependencies,
  configuredEntries,
  interpolateTemplate,
  objectValue,
  readPath,
  removePath,
  resolveTemplates,
  writePath,
} from "./runtime.workflow-runtime-dependencies";

export function matchesComparison(
  actual: unknown,
  operator: string,
  expected: unknown,
) {
  if (operator === "exists") return actual !== undefined && actual !== null;
  if (operator === "isEmpty")
    return (
      actual === undefined ||
      actual === null ||
      actual === "" ||
      (Array.isArray(actual) && actual.length === 0) ||
      (typeof actual === "object" &&
        actual !== null &&
        Object.keys(actual).length === 0)
    );
  if (operator === "notEquals") return actual !== expected;
  if (operator === "greaterThan") return Number(actual) > Number(expected);
  if (operator === "lessThan") return Number(actual) < Number(expected);
  if (operator === "contains")
    return Array.isArray(actual)
      ? actual.includes(expected)
      : String(actual ?? "").includes(String(expected ?? ""));
  if (operator === "startsWith")
    return String(actual ?? "").startsWith(String(expected ?? ""));
  return actual === expected;
}

export const manualTrigger: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ context }) => ({ output: await context.get("input") });

export const setData: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => ({
  output: {
    ...objectValue(input),
    ...Object.fromEntries(
      configuredEntries(resolveTemplates(params.values, input)),
    ),
  },
});

export const pickData: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const paths = Array.isArray(params.paths)
    ? params.paths.map(String).filter(Boolean)
    : [];
  return {
    output: paths.reduce<unknown>((result, path) => {
      const value = readPath(input, path);
      return value === undefined ? result : writePath(result, path, value);
    }, {}),
  };
};

export const removeData: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const paths = Array.isArray(params.paths)
    ? params.paths.map(String).filter(Boolean)
    : [];
  return { output: paths.reduce(removePath, input) };
};

export const renameData: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const from = String(params.from ?? "");
  const to = String(params.to ?? "");
  const value = readPath(input, from);
  return {
    output:
      value === undefined
        ? input
        : writePath(removePath(input, from), to, value),
  };
};

export const templateData: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => ({
  output: writePath(
    input,
    String(params.outputPath ?? ""),
    interpolateTemplate(String(params.template ?? ""), input),
  ),
});

export const parseJson: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const source = readPath(input, String(params.path ?? ""));
  if (typeof source !== "string") {
    throw new Error("The JSON source must be text.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("The selected value does not contain valid JSON.");
  }
  return {
    output: writePath(input, String(params.outputPath ?? ""), parsed),
  };
};

export const stringifyJson: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => ({
  output: writePath(
    input,
    String(params.outputPath ?? ""),
    JSON.stringify(readPath(input, String(params.path ?? ""))),
  ),
});

export const transformText: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const value = String(readPath(input, String(params.path ?? "")) ?? "");
  const operation = String(params.operation ?? "trim");
  const transformed =
    operation === "uppercase"
      ? value.toUpperCase()
      : operation === "lowercase"
        ? value.toLowerCase()
        : operation === "replace"
          ? String(params.search ?? "")
            ? value.replaceAll(
                String(params.search),
                String(params.replacement ?? ""),
              )
            : value
          : value.trim();
  return {
    output: writePath(input, String(params.outputPath ?? ""), transformed),
  };
};
