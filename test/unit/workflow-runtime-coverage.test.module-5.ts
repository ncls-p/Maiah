import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { invokeNode } from "./workflow-runtime-coverage.test.dependencies";


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
