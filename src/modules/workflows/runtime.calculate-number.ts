import { setTimeout as wait } from "node:timers/promises";

import {
type NodeFunction
} from "flowcraft";


import { matchesComparison } from "./runtime.matches-comparison";
import {
RuntimeContext,
WorkflowRuntimeDependencies,
interpolateTemplate,
objectValue,
readPath,
writePath,
} from "./runtime.workflow-runtime-dependencies";

export const calculateNumber: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const value = Number(readPath(input, String(params.path ?? "")));
  const operand = Number(params.operand ?? 0);
  const operation = String(params.operation ?? "add");
  if (!Number.isFinite(value) || !Number.isFinite(operand)) {
    throw new Error("The calculation requires finite numbers.");
  }
  if ((operation === "divide" || operation === "modulo") && operand === 0) {
    throw new Error("Division by zero is not allowed.");
  }
  const result =
    operation === "subtract"
      ? value - operand
      : operation === "multiply"
        ? value * operand
        : operation === "divide"
          ? value / operand
          : operation === "modulo"
            ? value % operand
            : operation === "round"
              ? Math.round(value)
              : value + operand;
  return {
    output: writePath(input, String(params.outputPath ?? ""), result),
  };
};

function listAtPath(input: unknown, path: unknown) {
  const value = readPath(input, String(path ?? ""));
  if (!Array.isArray(value))
    throw new Error("The selected value must be a list.");
  return value;
}

export const filterList: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const list = listAtPath(input, params.path);
  const field = String(params.field ?? "");
  const filtered = list.filter((item) =>
    matchesComparison(
      readPath(item, field),
      String(params.operator ?? "equals"),
      params.value,
    ),
  );
  return {
    output: writePath(input, String(params.outputPath ?? ""), filtered),
  };
};

export const sortList: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const field = String(params.field ?? "");
  const direction = params.direction === "descending" ? -1 : 1;
  const sorted = [...listAtPath(input, params.path)].sort((left, right) => {
    const a = readPath(left, field);
    const b = readPath(right, field);
    if (a === b) return 0;
    if (a === undefined || a === null) return 1;
    if (b === undefined || b === null) return -1;
    return (
      String(a).localeCompare(String(b), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction
    );
  });
  return {
    output: writePath(input, String(params.outputPath ?? ""), sorted),
  };
};

export const sliceList: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const start = Math.max(0, Number(params.start) || 0);
  const limit = Math.max(1, Math.min(10_000, Number(params.limit) || 10));
  return {
    output: writePath(
      input,
      String(params.outputPath ?? ""),
      listAtPath(input, params.path).slice(start, start + limit),
    ),
  };
};

export const condition: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies,
  unknown,
  unknown,
  "true" | "false"
> = async ({ input, params }) => {
  const actual = readPath(input, String(params.path ?? ""));
  const operator = String(params.operator ?? "equals");
  const matches = matchesComparison(actual, operator, params.value);
  return { output: input, action: matches ? "true" : "false" };
};

export const delayFlow: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params, signal }) => {
  const delayMs = Math.max(0, Math.min(60_000, Number(params.delayMs) || 0));
  await wait(delayMs, undefined, { signal });
  return { output: input };
};

export const stopFlow: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => ({
  output: {
    ...objectValue(input),
    workflowResult: interpolateTemplate(String(params.message ?? ""), input),
  },
});

export const currentDate: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const now = new Date();
  const format = String(params.format ?? "iso");
  const value =
    format === "timestamp"
      ? now.getTime()
      : format === "date"
        ? now.toISOString().slice(0, 10)
        : now.toISOString();
  return {
    output: writePath(input, String(params.outputPath ?? ""), value),
  };
};

export function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}
