import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
  workflowDefinitionSchema,
  type WorkflowDefinition,
  type WorkflowNode,
} from "./contracts";

export type WorkflowRuntimeDependencies = {
  workspaceId: string;
  userId: string;
  runId: string;
};

type RuntimeContext = Record<string, unknown>;
function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function inputAsText(input: unknown) {
  return typeof input === "string" ? input : JSON.stringify(input ?? null);
}

function nodeAbortSignal(signal: AbortSignal | undefined, timeoutMs: unknown) {
  const timeout = Math.max(250, Math.min(120_000, Number(timeoutMs) || 30_000));
  const timeoutSignal = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function readPath(value: unknown, path: string) {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (typeof current !== "object" || current === null) return undefined;
      return (current as Record<string, unknown>)[segment];
    }, value);
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
    ...objectValue(params.values),
  },
});

const condition: NodeFunction<
  RuntimeContext,
  WorkflowRuntimeDependencies,
  unknown,
  unknown,
  "true" | "false"
> = async ({ input, params }) => {
  const actual = readPath(input, String(params.path ?? ""));
  const expected = params.value;
  const operator = String(params.operator ?? "equals");
  const matches =
    operator === "exists"
      ? actual !== undefined && actual !== null
      : operator === "notEquals"
        ? actual !== expected
        : operator === "greaterThan"
          ? Number(actual) > Number(expected)
          : operator === "lessThan"
            ? Number(actual) < Number(expected)
            : actual === expected;
  return { output: input, action: matches ? "true" : "false" };
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
> = async ({ input, params, signal }) => {
  const url = await assertSafeHttpUrl(params.url);
  const method = String(params.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }
  const headers = Object.fromEntries(
    Object.entries(objectValue(params.headers)).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
  const hasBody = !["GET", "DELETE"].includes(method);
  const bodyValue = params.body === undefined ? input : params.body;
  if (hasBody && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(bodyValue ?? null) : undefined,
    redirect: "manual",
    signal: nodeAbortSignal(signal, params.__timeoutMs),
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
  const prompt = String(params.prompt ?? "{{input}}").replaceAll(
    "{{input}}",
    inputAsText(input),
  );
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

export const WORKFLOW_NODE_REGISTRY = {
  "trigger.manual": manualTrigger,
  "data.set": setData,
  "logic.condition": condition,
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
    let url: URL;
    try {
      url = new URL(String(params.url ?? ""));
    } catch {
      throw new Error(`Node '${node.label}' requires a valid HTTPS URL.`);
    }
    if (url.protocol !== "https:" || url.toString().length > 2_048) {
      throw new Error(`Node '${node.label}' requires a valid HTTPS URL.`);
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
