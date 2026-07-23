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
import { executeCodeSandbox } from "@/modules/tool/code-sandbox";

import {
  isWorkflowSecretReference,
  resolveWorkflowSecretReferences,
} from "./agentic-history";
import {
  workflowDefinitionSchema,
  type WorkflowDefinition,
  type WorkflowNode,
} from "./contracts";

export type WorkflowRuntimeDependencies = {
  workspaceId: string;
  workflowId: string;
  userId: string;
  runId: string;
};

type RuntimeContext = Record<string, unknown>;
function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function configuredEntries(value: unknown) {
  return Object.entries(objectValue(value)).filter(([key]) => key.trim());
}

function inputAsText(input: unknown) {
  return typeof input === "string" ? input : JSON.stringify(input ?? null);
}

function nodeAbortSignal(signal: AbortSignal | undefined, timeoutMs: unknown) {
  const timeout = Math.max(250, Math.min(120_000, Number(timeoutMs) || 30_000));
  const timeoutSignal = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function pathSegments(path: string) {
  const segments = path.split(".").filter(Boolean);
  if (segments.some((segment) => UNSAFE_PATH_SEGMENTS.has(segment))) {
    throw new Error("Workflow field paths cannot access object prototypes.");
  }
  return segments;
}

function readPath(value: unknown, path: string) {
  return pathSegments(path).reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

function writePath(input: unknown, path: string, value: unknown): unknown {
  const segments = pathSegments(path);
  if (segments.length === 0) return value;
  const root = { ...objectValue(input) };
  let current = root;
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      current[segment] = value;
      break;
    }
    const next = objectValue(current[segment]);
    current[segment] = { ...next };
    current = current[segment] as Record<string, unknown>;
  }
  return root;
}

function removePath(input: unknown, path: string): unknown {
  const segments = pathSegments(path);
  if (segments.length === 0) return input;
  const root = { ...objectValue(input) };
  let current = root;
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      delete current[segment];
      break;
    }
    const next = objectValue(current[segment]);
    current[segment] = { ...next };
    current = current[segment] as Record<string, unknown>;
  }
  return root;
}

function templateValue(path: string, input: unknown) {
  return path.trim() === "input" ? input : readPath(input, path.trim());
}

function interpolateTemplate(template: string, input: unknown): unknown {
  const exact = template.match(/^\s*{{\s*([^{}]+?)\s*}}\s*$/);
  if (exact?.[1]) return templateValue(exact[1], input);
  return template.replace(/{{\s*([^{}]+?)\s*}}/g, (_, path: string) => {
    const value = templateValue(path, input);
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

function resolveTemplates(value: unknown, input: unknown): unknown {
  if (typeof value === "string") return interpolateTemplate(value, input);
  if (Array.isArray(value))
    return value.map((item) => resolveTemplates(item, input));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveTemplates(item, input),
      ]),
    );
  }
  return value;
}

function matchesComparison(
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

const manualTrigger: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ context }) => ({ output: await context.get("input") });

const setData: NodeFunction<
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

const pickData: NodeFunction<
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

const removeData: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => {
  const paths = Array.isArray(params.paths)
    ? params.paths.map(String).filter(Boolean)
    : [];
  return { output: paths.reduce(removePath, input) };
};

const renameData: NodeFunction<
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

const templateData: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => ({
  output: writePath(
    input,
    String(params.outputPath ?? ""),
    interpolateTemplate(String(params.template ?? ""), input),
  ),
});

const parseJson: NodeFunction<
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

const stringifyJson: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => ({
  output: writePath(
    input,
    String(params.outputPath ?? ""),
    JSON.stringify(readPath(input, String(params.path ?? ""))),
  ),
});

const transformText: NodeFunction<
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

const calculateNumber: NodeFunction<
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

const filterList: NodeFunction<
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

const sortList: NodeFunction<
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

const sliceList: NodeFunction<
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

const condition: NodeFunction<
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

const delayFlow: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params, signal }) => {
  const delayMs = Math.max(0, Math.min(60_000, Number(params.delayMs) || 0));
  await wait(delayMs, undefined, { signal });
  return { output: input };
};

const stopFlow: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params }) => ({
  output: {
    ...objectValue(input),
    workflowResult: interpolateTemplate(String(params.message ?? ""), input),
  },
});

const currentDate: NodeFunction<
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

function isPrivateIpv4(address: string) {
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

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

async function assertSafeHttpUrl(rawUrl: unknown) {
  const url = new URL(String(rawUrl ?? ""));
  if (url.protocol !== "https:") {
    throw new Error("HTTP workflow nodes only allow HTTPS URLs.");
  }
  if (url.username || url.password) {
    throw new Error("Credentials are not allowed in workflow URLs.");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error(
      "The workflow URL resolves to a private or reserved address.",
    );
  }
  return url;
}

const httpRequest: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params, signal, dependencies }) => {
  const resolvedParams = (await resolveWorkflowSecretReferences(params, {
    workflowId: dependencies.workflowId,
    workspaceId: dependencies.workspaceId,
  })) as Record<string, unknown>;
  const url = await assertSafeHttpUrl(resolvedParams.url);
  for (const [key, value] of configuredEntries(resolvedParams.query)) {
    const resolved = resolveTemplates(value, input);
    if (resolved !== undefined && resolved !== null) {
      url.searchParams.set(key, String(resolved));
    }
  }
  const method = String(resolvedParams.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }
  const headers = Object.fromEntries(
    configuredEntries(resolvedParams.headers).map(([key, value]) => [
      key,
      String(resolveTemplates(value, input)),
    ]),
  );
  const hasBody = !["GET", "DELETE"].includes(method);
  const bodyValue =
    resolvedParams.body === undefined
      ? input
      : resolveTemplates(resolvedParams.body, input);
  if (hasBody && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(bodyValue ?? null) : undefined,
    redirect: "manual",
    signal: nodeAbortSignal(signal, resolvedParams.__timeoutMs),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("HTTP redirects are not followed by workflow nodes.");
  }
  const text = (await response.text()).slice(0, 1_000_000);
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Text responses remain strings.
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return {
    output: {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    },
  };
};

const executeCode: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params, dependencies }) => {
  const language = params.language === "python" ? "python" : "node";
  const result = await executeCodeSandbox(
    {
      language,
      code: String(params.code ?? ""),
      stdin: inputAsText(input),
      timeoutMs:
        typeof params.__timeoutMs === "number" ? params.__timeoutMs : undefined,
    },
    {
      workspaceId: dependencies.workspaceId,
      userId: dependencies.userId,
    },
  );
  if (!result.ok) {
    throw new Error(
      result.stderr || result.error || "Sandbox execution failed.",
    );
  }
  const stdout = result.stdout.trim();
  try {
    return { output: stdout ? JSON.parse(stdout) : null };
  } catch {
    return { output: stdout };
  }
};

const runAgent: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies
> = async ({ input, params, dependencies, signal }) => {
  const agentId = String(params.agentId ?? "");
  if (!agentId) throw new Error("An agent must be selected.");
  const promptValue = interpolateTemplate(
    String(params.prompt ?? "{{input}}"),
    input,
  );
  const prompt =
    typeof promptValue === "string" ? promptValue : inputAsText(promptValue);
  const result = await executeAgent({
    workspaceId: dependencies.workspaceId,
    userId: dependencies.userId,
    agentId,
    prompt,
    trigger: "api",
    idempotencyKey: `${dependencies.runId}:${String(params.__nodeId ?? agentId)}`,
    abortSignal: nodeAbortSignal(signal, params.__timeoutMs),
  });
  return { output: { text: result.text, agentRunId: result.runId } };
};

const debugSnapshot: NodeFunction<RuntimeContext> = async ({ input }) => ({
  output: input,
});

export const WORKFLOW_NODE_REGISTRY = {
  "trigger.manual": manualTrigger,
  "data.set": setData,
  "data.pick": pickData,
  "data.remove": removeData,
  "data.rename": renameData,
  "data.template": templateData,
  "data.parseJson": parseJson,
  "data.stringifyJson": stringifyJson,
  "text.transform": transformText,
  "number.calculate": calculateNumber,
  "list.filter": filterList,
  "list.sort": sortList,
  "list.slice": sliceList,
  "logic.condition": condition,
  "logic.delay": delayFlow,
  "logic.stop": stopFlow,
  "debug.snapshot": debugSnapshot,
  "date.now": currentDate,
  "http.request": httpRequest,
  "code.execute": executeCode,
  "agent.run": runAgent,
} as const;

function hasCycle(definition: WorkflowDefinition) {
  const outgoing = new Map<string, string[]>();
  for (const node of definition.nodes) outgoing.set(node.id, []);
  for (const edge of definition.edges)
    outgoing.get(edge.source)?.push(edge.target);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return definition.nodes.some((node) => visit(node.id));
}

function assertNodeParameters(node: WorkflowNode) {
  const params = node.parameters;
  if (node.type === "agent.run") {
    if (
      typeof params.agentId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        params.agentId,
      )
    ) {
      throw new Error(`Node '${node.label}' requires a valid agent.`);
    }
    if (typeof params.prompt !== "string" || !params.prompt.trim()) {
      throw new Error(`Node '${node.label}' requires an instruction.`);
    }
  }
  if (node.type === "http.request") {
    if (!isWorkflowSecretReference(params.url)) {
      let url: URL;
      try {
        url = new URL(String(params.url ?? ""));
      } catch {
        throw new Error(`Node '${node.label}' requires a valid HTTPS URL.`);
      }
      if (url.protocol !== "https:" || url.toString().length > 2_048) {
        throw new Error(`Node '${node.label}' requires a valid HTTPS URL.`);
      }
    }
    if (
      params.headers !== undefined &&
      Object.keys(objectValue(params.headers)).length > 50
    ) {
      throw new Error(`Node '${node.label}' has too many HTTP headers.`);
    }
  }
  if (node.type === "code.execute") {
    if (params.language !== "node" && params.language !== "python") {
      throw new Error(`Node '${node.label}' has an invalid code language.`);
    }
    if (
      typeof params.code !== "string" ||
      !params.code.trim() ||
      params.code.length > 100_000
    ) {
      throw new Error(
        `Node '${node.label}' requires code under 100,000 characters.`,
      );
    }
  }
  if (
    node.type === "data.set" &&
    Object.keys(objectValue(params.values)).length > 200
  ) {
    throw new Error(`Node '${node.label}' defines too many fields.`);
  }
  if (
    (node.type === "data.pick" || node.type === "data.remove") &&
    (!Array.isArray(params.paths) ||
      params.paths.length === 0 ||
      params.paths.length > 200 ||
      params.paths.some((path) => typeof path !== "string" || !path.trim()))
  ) {
    throw new Error(`Node '${node.label}' requires one or more field paths.`);
  }
  if (
    node.type === "data.rename" &&
    (typeof params.from !== "string" ||
      !params.from.trim() ||
      typeof params.to !== "string" ||
      !params.to.trim())
  ) {
    throw new Error(`Node '${node.label}' requires source and target paths.`);
  }
  if (
    (node.type === "data.template" ||
      node.type === "data.parseJson" ||
      node.type === "data.stringifyJson" ||
      node.type === "text.transform" ||
      node.type === "number.calculate" ||
      node.type === "list.filter" ||
      node.type === "list.sort" ||
      node.type === "list.slice" ||
      node.type === "date.now") &&
    (typeof params.outputPath !== "string" || !params.outputPath.trim())
  ) {
    throw new Error(`Node '${node.label}' requires an output path.`);
  }
  if (
    node.type === "logic.delay" &&
    (!Number.isFinite(Number(params.delayMs)) ||
      Number(params.delayMs) < 0 ||
      Number(params.delayMs) > 60_000)
  ) {
    throw new Error(`Node '${node.label}' requires a delay under 60 seconds.`);
  }
  if (
    node.type === "logic.condition" &&
    (typeof params.path !== "string" || !params.path.trim())
  ) {
    throw new Error(`Node '${node.label}' requires a field path.`);
  }
}

export function compileWorkflowDefinition(input: {
  workflowId: string;
  version: number;
  definition: unknown;
}): { definition: WorkflowDefinition; blueprint: WorkflowBlueprint } {
  const definition = workflowDefinitionSchema.parse(input.definition);
  for (const node of definition.nodes) assertNodeParameters(node);
  if (hasCycle(definition)) {
    throw new Error("Workflow cycles are not supported yet.");
  }
  const blueprint: WorkflowBlueprint = {
    id: `${input.workflowId}@${input.version}`,
    metadata: { version: String(input.version), schemaVersion: 1 },
    nodes: definition.nodes.map((node) => ({
      id: node.id,
      uses: node.type,
      params: {
        ...node.parameters,
        __nodeId: node.id,
        __timeoutMs: node.settings.timeoutMs,
      },
      config: {
        timeout: node.settings.timeoutMs,
        // Flowcraft names this field maxRetries but interprets it as the total
        // number of attempts. Maiah's DSL exposes the less surprising number
        // of additional retries.
        maxRetries: node.settings.maxRetries + 1,
        retryDelay: node.settings.retryDelayMs,
      },
    })),
    edges: definition.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      action: edge.sourceHandle ?? undefined,
    })),
  };
  const registry = WORKFLOW_NODE_REGISTRY as unknown as Record<
    string,
    NodeFunction
  >;
  const lint = lintBlueprint(blueprint, registry);
  if (!lint.isValid) {
    throw new Error(lint.issues.map((issue) => issue.message).join(" "));
  }
  return { definition, blueprint };
}

export function createWorkflowRuntime(input: {
  dependencies: WorkflowRuntimeDependencies;
  eventBus?: IEventBus;
}) {
  return new FlowRuntime<RuntimeContext, WorkflowRuntimeDependencies>({
    registry: WORKFLOW_NODE_REGISTRY as unknown as Record<string, NodeFunction>,
    dependencies: input.dependencies,
    eventBus: input.eventBus,
    strict: true,
  });
}

export function createWorkflowEventBus(
  emit: (event: FlowcraftEvent) => void | Promise<void>,
): IEventBus {
  return { emit };
}

export function workflowNodeById(
  definition: WorkflowDefinition,
  nodeId: string,
): WorkflowNode | undefined {
  return definition.nodes.find((node) => node.id === nodeId);
}
