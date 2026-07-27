import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

vi.mock("@/modules/agent/runtime-executor", () => ({
  executeAgent: vi.fn(),
}));

vi.mock("@/modules/tool/code-sandbox", () => ({
  executeCodeSandbox: vi.fn(),
}));

import { lookup } from "node:dns/promises";

import { executeAgent } from "@/modules/agent/runtime-executor";
import { executeCodeSandbox } from "@/modules/tool/code-sandbox";
import {
  createStarterDefinition,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowNodeType,
} from "@/modules/workflows/contracts";
import {
  WORKFLOW_NODE_REGISTRY,
  compileWorkflowDefinition,
  createWorkflowEventBus,
  createWorkflowRuntime,
  workflowNodeById,
} from "@/modules/workflows/runtime";

const dependencies = {
  workspaceId: "workspace-1",
  workflowId: "workflow-1",
  userId: "user-1",
  runId: "run-1",
};

const settings = {
  timeoutMs: 30_000,
  maxRetries: 0,
  retryDelayMs: 1_000,
};

async function invokeNode(
  type: WorkflowNodeType,
  input: unknown,
  params: Record<string, unknown> = {},
  extras: Record<string, unknown> = {},
) {
  const handler = WORKFLOW_NODE_REGISTRY[type] as unknown as (
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  return handler({
    input,
    params,
    dependencies,
    context: { get: vi.fn().mockResolvedValue(input) },
    signal: undefined,
    ...extras,
  });
}

function definitionWith(node: WorkflowNode): WorkflowDefinition {
  return {
    schemaVersion: 1,
    nodes: [...createStarterDefinition().nodes, node],
    edges: [{ id: "edge", source: "trigger", target: node.id }],
  };
}

function node(
  type: WorkflowNodeType,
  parameters: Record<string, unknown>,
): WorkflowNode {
  return {
    id: `node-${type.replace(".", "-")}`,
    type,
    label: type,
    position: { x: 100, y: 100 },
    parameters,
    settings,
  };
}

beforeEach(() => {
  vi.mocked(lookup)
    .mockReset()
    .mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
  vi.mocked(executeCodeSandbox)
    .mockReset()
    .mockResolvedValue({
      ok: true,
      stdout: '{"ok":true}',
      stderr: "",
    } as never);
  vi.mocked(executeAgent)
    .mockReset()
    .mockResolvedValue({
      runId: "agent-run-1",
      text: "Agent answer",
      inputTokens: 1,
      outputTokens: 2,
      totalTreeTokens: 3,
      reused: false,
    } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workflow data nodes", () => {
  it("reads the trigger and resolves nested data templates", async () => {
    await expect(
      invokeNode(
        "trigger.manual",
        undefined,
        {},
        {
          context: { get: vi.fn().mockResolvedValue({ name: "Ada" }) },
        },
      ),
    ).resolves.toEqual({ output: { name: "Ada" } });

    await expect(
      invokeNode(
        "data.set",
        { name: "Ada", nested: { count: 2 } },
        {
          values: {
            "": "ignored",
            greeting: "Bonjour {{name}}",
            exact: "{{nested}}",
            list: ["{{name}}", { value: "{{nested.count}}" }],
            missing: "{{unknown}}",
          },
        },
      ),
    ).resolves.toEqual({
      output: {
        name: "Ada",
        nested: { count: 2 },
        greeting: "Bonjour Ada",
        exact: { count: 2 },
        list: ["Ada", { value: 2 }],
        missing: undefined,
      },
    });
  });

  it("picks, removes, renames, and templates nested fields", async () => {
    const input = {
      profile: { name: "Ada", secret: true },
      untouched: 1,
    };
    await expect(
      invokeNode("data.pick", input, {
        paths: ["profile.name", "missing"],
      }),
    ).resolves.toEqual({ output: { profile: { name: "Ada" } } });
    await expect(
      invokeNode("data.pick", input, { paths: "invalid" }),
    ).resolves.toEqual({ output: {} });
    await expect(
      invokeNode("data.remove", input, { paths: ["profile.secret"] }),
    ).resolves.toEqual({
      output: { profile: { name: "Ada" }, untouched: 1 },
    });
    await expect(
      invokeNode("data.remove", input, { paths: null }),
    ).resolves.toEqual({ output: input });
    await expect(
      invokeNode("data.rename", input, {
        from: "profile.name",
        to: "identity.displayName",
      }),
    ).resolves.toEqual({
      output: {
        profile: { secret: true },
        identity: { displayName: "Ada" },
        untouched: 1,
      },
    });
    await expect(
      invokeNode("data.rename", input, { from: "missing", to: "new" }),
    ).resolves.toEqual({ output: input });
    await expect(
      invokeNode("data.template", input, {
        template: "{{input}}",
        outputPath: "",
      }),
    ).resolves.toEqual({ output: input });
  });

  it("rejects field paths that access object prototypes", async () => {
    await expect(
      invokeNode(
        "data.rename",
        { value: "unsafe" },
        {
          from: "value",
          to: "__proto__.polluted",
        },
      ),
    ).rejects.toThrow("cannot access object prototypes");
    await expect(
      invokeNode(
        "data.pick",
        { value: "unsafe" },
        {
          paths: ["constructor.prototype.polluted"],
        },
      ),
    ).rejects.toThrow("cannot access object prototypes");
    expect(
      (Object.prototype as Record<string, unknown>).polluted,
    ).toBeUndefined();
  });

  it("parses and serializes JSON with useful failures", async () => {
    await expect(
      invokeNode(
        "data.parseJson",
        { raw: '{"value":1}' },
        {
          path: "raw",
          outputPath: "parsed",
        },
      ),
    ).resolves.toEqual({
      output: { raw: '{"value":1}', parsed: { value: 1 } },
    });
    await expect(
      invokeNode(
        "data.parseJson",
        { raw: 1 },
        {
          path: "raw",
          outputPath: "parsed",
        },
      ),
    ).rejects.toThrow("must be text");
    await expect(
      invokeNode(
        "data.parseJson",
        { raw: "{" },
        {
          path: "raw",
          outputPath: "parsed",
        },
      ),
    ).rejects.toThrow("valid JSON");
    await expect(
      invokeNode(
        "data.stringifyJson",
        { parsed: { value: 1 } },
        {
          path: "parsed",
          outputPath: "json",
        },
      ),
    ).resolves.toEqual({
      output: { parsed: { value: 1 }, json: '{"value":1}' },
    });
  });
});

describe("workflow text and number nodes", () => {
  it.each([
    ["uppercase", "  ADA  "],
    ["lowercase", "  ada  "],
    ["trim", "Ada"],
  ])("applies the %s text operation", async (operation, expected) => {
    await expect(
      invokeNode(
        "text.transform",
        { value: "  Ada  " },
        {
          path: "value",
          operation,
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: expected } });
  });

  it("replaces text and leaves it unchanged without a search value", async () => {
    await expect(
      invokeNode(
        "text.transform",
        { value: "Ada Ada" },
        {
          path: "value",
          operation: "replace",
          search: "Ada",
          replacement: "Grace",
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: "Grace Grace" } });
    await expect(
      invokeNode(
        "text.transform",
        { value: "Ada" },
        {
          path: "value",
          operation: "replace",
          search: "",
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: "Ada" } });
  });

  it.each([
    ["add", 5, 2, 7],
    ["subtract", 5, 2, 3],
    ["multiply", 5, 2, 10],
    ["divide", 5, 2, 2.5],
    ["modulo", 5, 2, 1],
    ["round", 5.6, 0, 6],
  ])("calculates %s", async (operation, value, operand, expected) => {
    await expect(
      invokeNode(
        "number.calculate",
        { value },
        {
          path: "value",
          operation,
          operand,
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: expected } });
  });

  it("rejects invalid calculations", async () => {
    await expect(
      invokeNode(
        "number.calculate",
        { value: "not-a-number" },
        {
          path: "value",
          operand: 1,
          outputPath: "result",
        },
      ),
    ).rejects.toThrow("finite numbers");
    await expect(
      invokeNode(
        "number.calculate",
        { value: 1 },
        {
          path: "value",
          operation: "divide",
          operand: 0,
          outputPath: "result",
        },
      ),
    ).rejects.toThrow("Division by zero");
  });
});

describe("workflow list and logic nodes", () => {
  it.each([
    ["equals", 2, [2]],
    ["notEquals", 2, [1, 3]],
    ["greaterThan", 2, [3]],
    ["lessThan", 2, [1]],
    ["contains", "alp", ["alpha"]],
    ["startsWith", "be", ["beta"]],
  ])("filters scalar lists with %s", async (operator, value, expected) => {
    const list =
      operator === "contains" || operator === "startsWith"
        ? ["alpha", "beta", "gamma"]
        : [1, 2, 3];
    await expect(
      invokeNode(
        "list.filter",
        { list },
        {
          path: "list",
          field: "",
          operator,
          value,
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: expected } });
  });

  it("filters arrays, presence, and all empty value shapes", async () => {
    const items = [
      { value: ["tag"] },
      { value: [] },
      { value: {} },
      { value: "" },
      { value: null },
      {},
    ];
    await expect(
      invokeNode(
        "list.filter",
        { items },
        {
          path: "items",
          field: "value",
          operator: "contains",
          value: "tag",
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: [items[0]] } });
    await expect(
      invokeNode(
        "list.filter",
        { items },
        {
          path: "items",
          field: "value",
          operator: "exists",
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: items.slice(0, 4) } });
    await expect(
      invokeNode(
        "list.filter",
        { items },
        {
          path: "items",
          field: "value",
          operator: "isEmpty",
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: items.slice(1) } });
  });

  it("sorts and slices lists while handling missing values", async () => {
    const items = [
      { score: 2 },
      { score: null },
      { score: 10 },
      {},
      { score: 2 },
    ];
    const ascending = await invokeNode(
      "list.sort",
      { items },
      {
        path: "items",
        field: "score",
        direction: "ascending",
        outputPath: "result",
      },
    );
    expect(ascending).toMatchObject({
      output: {
        result: [
          { score: 2 },
          { score: 2 },
          { score: 10 },
          { score: null },
          {},
        ],
      },
    });
    const descending = await invokeNode(
      "list.sort",
      { items },
      {
        path: "items",
        field: "score",
        direction: "descending",
        outputPath: "result",
      },
    );
    expect(descending).toMatchObject({
      output: {
        result: [
          { score: 10 },
          { score: 2 },
          { score: 2 },
          { score: null },
          {},
        ],
      },
    });
    await expect(
      invokeNode(
        "list.slice",
        { items: [1, 2, 3, 4] },
        {
          path: "items",
          start: -4,
          limit: 2,
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: [1, 2] } });
    await expect(
      invokeNode(
        "list.filter",
        { items: "not-a-list" },
        {
          path: "items",
          outputPath: "result",
        },
      ),
    ).rejects.toThrow("must be a list");
  });

  it("routes conditions and supports delay, terminal, and date nodes", async () => {
    await expect(
      invokeNode(
        "logic.condition",
        { amount: 5 },
        {
          path: "amount",
          operator: "greaterThan",
          value: 2,
        },
      ),
    ).resolves.toEqual({ output: { amount: 5 }, action: "true" });
    await expect(
      invokeNode(
        "logic.condition",
        { amount: 1 },
        {
          path: "amount",
          operator: "greaterThan",
          value: 2,
        },
      ),
    ).resolves.toEqual({ output: { amount: 1 }, action: "false" });
    await expect(
      invokeNode("logic.delay", { done: false }, { delayMs: -1 }),
    ).resolves.toEqual({ output: { done: false } });
    await expect(
      invokeNode("logic.stop", "primitive", { message: "Done {{input}}" }),
    ).resolves.toEqual({ output: { workflowResult: "Done primitive" } });

    for (const format of ["iso", "date", "timestamp"]) {
      const result = await invokeNode(
        "date.now",
        {},
        {
          format,
          outputPath: "now",
        },
      );
      expect(result).toMatchObject({ output: { now: expect.anything() } });
    }
  });
});

describe("workflow integration and expert nodes", () => {
  it("executes templated HTTPS requests and parses JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"saved":true}', {
        status: 201,
        headers: { "x-result": "ok" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeNode(
        "http.request",
        { id: 7, name: "Ada" },
        {
          url: "https://api.example.test/items",
          method: "POST",
          query: { id: "{{id}}", "": "ignored", skip: null },
          headers: { "x-name": "{{name}}", "": "ignored" },
          body: { person: "{{name}}", original: "{{input}}" },
          __timeoutMs: 500,
        },
      ),
    ).resolves.toEqual({
      output: {
        status: 201,
        headers: expect.objectContaining({ "x-result": "ok" }),
        body: { saved: true },
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: "?id=7" }),
      expect.objectContaining({
        method: "POST",
        headers: { "x-name": "Ada", "content-type": "application/json" },
        body: JSON.stringify({
          person: "Ada",
          original: { id: 7, name: "Ada" },
        }),
        redirect: "manual",
      }),
    );
  });

  it("handles text, empty, HTTP error, redirect, and invalid method responses", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response("plain text", { status: 200 }),
    );
    await expect(
      invokeNode(
        "http.request",
        {},
        {
          url: "https://api.example.test/text",
          method: "GET",
        },
      ),
    ).resolves.toMatchObject({ output: { body: "plain text" } });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      invokeNode(
        "http.request",
        {},
        {
          url: "https://api.example.test/empty",
          method: "DELETE",
        },
      ),
    ).resolves.toMatchObject({ output: { body: null } });

    fetchMock.mockResolvedValueOnce(new Response("moved", { status: 302 }));
    await expect(
      invokeNode(
        "http.request",
        {},
        {
          url: "https://api.example.test/redirect",
        },
      ),
    ).rejects.toThrow("redirects");

    fetchMock.mockResolvedValueOnce(
      new Response("bad request", { status: 400 }),
    );
    await expect(
      invokeNode(
        "http.request",
        {},
        {
          url: "https://api.example.test/error",
        },
      ),
    ).rejects.toThrow("HTTP 400");

    await expect(
      invokeNode(
        "http.request",
        {},
        {
          url: "https://api.example.test/items",
          method: "OPTIONS",
        },
      ),
    ).rejects.toThrow("Unsupported HTTP method");
  });

  it("blocks unsafe HTTP destinations", async () => {
    await expect(
      invokeNode("http.request", {}, { url: "http://example.test" }),
    ).rejects.toThrow("only allow HTTPS");
    await expect(
      invokeNode(
        "http.request",
        {},
        {
          url: "https://user:password@example.test",
        },
      ),
    ).rejects.toThrow("Credentials are not allowed");

    vi.mocked(lookup).mockResolvedValueOnce([] as never);
    await expect(
      invokeNode("http.request", {}, { url: "https://empty.example.test" }),
    ).rejects.toThrow("private or reserved");

    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.168.0.1",
      "224.0.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      vi.mocked(lookup).mockResolvedValueOnce([
        { address, family: address.includes(":") ? 6 : 4 },
      ] as never);
      await expect(
        invokeNode("http.request", {}, { url: "https://private.example.test" }),
      ).rejects.toThrow("private or reserved");
    }
  });

  it("returns JSON, text, empty, and failed sandbox outputs", async () => {
    await expect(
      invokeNode(
        "code.execute",
        { value: 1 },
        {
          language: "python",
          code: "print('{}')",
          __timeoutMs: 500,
        },
      ),
    ).resolves.toEqual({ output: { ok: true } });

    vi.mocked(executeCodeSandbox).mockResolvedValueOnce({
      ok: true,
      stdout: "plain output",
      stderr: "",
    } as never);
    await expect(
      invokeNode("code.execute", "input", { language: "node", code: "code" }),
    ).resolves.toEqual({ output: "plain output" });

    vi.mocked(executeCodeSandbox).mockResolvedValueOnce({
      ok: true,
      stdout: "",
      stderr: "",
    } as never);
    await expect(
      invokeNode("code.execute", null, { language: "node", code: "code" }),
    ).resolves.toEqual({ output: null });

    vi.mocked(executeCodeSandbox).mockResolvedValueOnce({
      ok: false,
      stdout: "",
      stderr: "sandbox failed",
    } as never);
    await expect(
      invokeNode("code.execute", {}, { language: "node", code: "code" }),
    ).rejects.toThrow("sandbox failed");

    vi.mocked(executeCodeSandbox).mockResolvedValueOnce({
      ok: false,
      exitCode: 1,
      timedOut: false,
      signal: null,
      durationMs: 5,
      stdout: "",
      stderr: `${"rss payload ".repeat(1_000)}\nSyntaxError: invalid formatter code\n    at main.mjs:12:3`,
    } as never);
    await expect(
      invokeNode("code.execute", {}, { language: "node", code: "code" }),
    ).rejects.toThrow(
      "Sandbox execution failed (exit code 1): SyntaxError: invalid formatter code",
    );
  });

  it("runs assistants with stable idempotency and validates selection", async () => {
    await expect(invokeNode("agent.run", {}, { agentId: "" })).rejects.toThrow(
      "must be selected",
    );

    const signal = new AbortController().signal;
    await expect(
      invokeNode(
        "agent.run",
        { topic: "workflows" },
        {
          agentId: "11111111-1111-4111-8111-111111111111",
          prompt: "{{input}}",
          __nodeId: "agent-node",
          __timeoutMs: 700,
        },
        { signal },
      ),
    ).resolves.toEqual({
      output: { text: "Agent answer", agentRunId: "agent-run-1" },
    });
    expect(executeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: JSON.stringify({ topic: "workflows" }),
        idempotencyKey: "run-1:agent-node",
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });
});

describe("workflow compilation validation and utilities", () => {
  it("builds blueprint configuration and exposes runtime helpers", async () => {
    const definition = definitionWith(
      node("data.set", { values: { done: true } }),
    );
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
    expect(workflowNodeById(definition, "node-data-set")?.type).toBe(
      "data.set",
    );
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
    [
      "agent.run",
      { agentId: "11111111-1111-4111-8111-111111111111", prompt: "" },
      "instruction",
    ],
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
            headers: Object.fromEntries(
              Array.from({ length: 51 }, (_, index) => [`x-${index}`, "value"]),
            ),
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
            values: Object.fromEntries(
              Array.from({ length: 201 }, (_, index) => [
                `field-${index}`,
                index,
              ]),
            ),
          }),
        ),
      }),
    ).toThrow("too many fields");
  });
});
