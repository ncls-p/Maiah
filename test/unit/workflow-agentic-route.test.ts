import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelV4Usage } from "@ai-sdk/provider";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { NextRequest } from "next/server";

import {
  createStarterDefinition,
  type WorkflowDefinition,
} from "@/modules/workflows/contracts";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getWorkflowDetail: vi.fn(),
  updateWorkflow: vi.fn(),
  listAgents: vi.fn(),
  getAgentById: vi.fn(),
  getAgentDefaultPreferences: vi.fn(),
  getConfiguredWorkflowBuilderAgentId: vi.fn(),
  getActiveVersion: vi.fn(),
  resolveProviderForVersion: vi.fn(),
  createChatModel: vi.fn(),
  getWorkflowAgentHistory: vi.fn(),
  getPendingWorkflowAgentRunRequests: vi.fn(),
  createWorkflowAgentRunRequest: vi.fn(),
  getWorkflowAgentTodoList: vi.fn(),
  updateWorkflowAgentTodoList: vi.fn(),
  appendWorkflowAgentMessage: vi.fn(),
  searchWebWithSearxng: vi.fn(),
  executeCodeSandbox: vi.fn(),
}));

vi.mock("@/lib/route-handler", () => ({
  requireWorkspacePermissionAsync: mocks.requirePermission,
  handleRoute: async (
    request: Request,
    handler: (context: {
      session: { user: { id: string } };
      request: Request;
    }) => Promise<Response>,
    options?: { expectedError?: (error: unknown) => Response | null },
  ) => {
    try {
      return await handler({
        session: { user: { id: userId } },
        request,
      });
    } catch (error) {
      return (
        options?.expectedError?.(error) ??
        Response.json({ error: "Internal server error" }, { status: 500 })
      );
    }
  },
}));

vi.mock("@/modules/agent/use-cases", () => ({
  listAgents: mocks.listAgents,
  getAgentById: mocks.getAgentById,
  getAgentDefaultPreferences: mocks.getAgentDefaultPreferences,
  getActiveVersion: mocks.getActiveVersion,
  resolveProviderForVersion: mocks.resolveProviderForVersion,
}));

vi.mock("@/modules/workflows/builder-settings", () => ({
  getConfiguredWorkflowBuilderAgentId:
    mocks.getConfiguredWorkflowBuilderAgentId,
}));

vi.mock("@/modules/agent/runtime-policy", () => ({
  createRuntimeDeadline: () => ({ signal: new AbortController().signal }),
}));

vi.mock("@/modules/workflows/use-cases", () => ({
  getWorkflowDetail: mocks.getWorkflowDetail,
  updateWorkflow: mocks.updateWorkflow,
}));

vi.mock("@/modules/workflows/agentic-history", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/modules/workflows/agentic-history")
    >();
  return {
    ...actual,
    getWorkflowAgentHistory: mocks.getWorkflowAgentHistory,
    appendWorkflowAgentMessage: mocks.appendWorkflowAgentMessage,
  };
});

vi.mock("@/modules/tool/builtin-tool-primitives", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/modules/tool/builtin-tool-primitives")
    >();
  return {
    ...actual,
    searchWebWithSearxng: mocks.searchWebWithSearxng,
  };
});

vi.mock("@/modules/tool/code-sandbox", () => ({
  executeCodeSandbox: mocks.executeCodeSandbox,
}));

vi.mock("@/modules/workflows/agentic-run-approvals", () => ({
  getPendingWorkflowAgentRunRequests: mocks.getPendingWorkflowAgentRunRequests,
  createWorkflowAgentRunRequest: mocks.createWorkflowAgentRunRequest,
}));

vi.mock("@/modules/workflows/agentic-todo-list", () => ({
  getWorkflowAgentTodoList: mocks.getWorkflowAgentTodoList,
  updateWorkflowAgentTodoList: mocks.updateWorkflowAgentTodoList,
}));

vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: () => ({ createChatModel: mocks.createChatModel }),
}));

import {
  GET,
  POST,
} from "@/app/api/workspace/workflows/[workflowId]/agentic/route";

const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const workflowId = "33333333-3333-4333-8333-333333333333";
const agentId = "44444444-4444-4444-8444-444444444444";
const versionId = "55555555-5555-4555-8555-555555555555";
const modelUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: 0,
  },
};

function toolCallStream(
  toolCallId: string,
  toolName: string,
  input: unknown,
) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        {
          type: "tool-call" as const,
          toolCallId,
          toolName,
          input: JSON.stringify(input),
        },
        {
          type: "finish" as const,
          usage: modelUsage,
          finishReason: {
            unified: "tool-calls" as const,
            raw: "tool_calls",
          },
        },
      ],
    }),
  };
}

function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        { type: "text-start" as const, id: "text-recovery" },
        {
          type: "text-delta" as const,
          id: "text-recovery",
          delta: text,
        },
        { type: "text-end" as const, id: "text-recovery" },
        {
          type: "finish" as const,
          usage: modelUsage,
          finishReason: { unified: "stop" as const, raw: "stop" },
        },
      ],
    }),
  };
}

const generatedDefinition = {
  schemaVersion: 1 as const,
  nodes: [
    ...createStarterDefinition().nodes,
    {
      id: "summary",
      type: "data.template" as const,
      label: "Prepare summary",
      position: { x: 360, y: 180 },
      parameters: {
        template: "Summary: {{message}}",
        outputPath: "summary",
      },
      settings: {
        timeoutMs: 30_000,
        maxRetries: 0,
        retryDelayMs: 1_000,
      },
    },
  ],
  edges: [
    {
      id: "edge-trigger-summary",
      source: "trigger",
      target: "summary",
      sourceHandle: null,
    },
  ],
};

const incompleteDefinition = {
  schemaVersion: 1 as const,
  nodes: [
    ...createStarterDefinition().nodes,
    {
      id: "assistant",
      type: "agent.run" as const,
      label: "",
      position: { x: 360, y: 180 },
      parameters: { agentId: "", prompt: "" },
      settings: {
        timeoutMs: 30_000,
        maxRetries: 0,
        retryDelayMs: 1_000,
      },
    },
  ],
  edges: [
    {
      id: "edge-trigger-assistant",
      source: "trigger",
      target: "assistant",
      sourceHandle: null,
    },
  ],
};

function request(definition: WorkflowDefinition = incompleteDefinition) {
  return new NextRequest(
    `http://localhost/api/workspace/workflows/${workflowId}/agentic`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        message: "Build a summary workflow",
        draft: {
          name: "Summary workflow",
          description: null,
          definition,
        },
      }),
    },
  );
}

describe("workflow agentic route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue(null);
    mocks.getWorkflowDetail.mockResolvedValue({
      id: workflowId,
      workspaceId,
      name: "Summary",
      description: null,
      latestVersion: 1,
      version: 1,
      definition: createStarterDefinition(),
    });
    mocks.listAgents.mockResolvedValue([
      { id: agentId, name: "Workflow assistant" },
    ]);
    mocks.getAgentById.mockResolvedValue(null);
    mocks.getConfiguredWorkflowBuilderAgentId.mockResolvedValue(null);
    mocks.getWorkflowAgentHistory.mockResolvedValue({
      messages: [],
      pendingRequests: [],
    });
    mocks.getPendingWorkflowAgentRunRequests.mockResolvedValue([]);
    mocks.getWorkflowAgentTodoList.mockResolvedValue(null);
    mocks.updateWorkflowAgentTodoList.mockImplementation(async (input) => ({
      kind: "chat_todo_list",
      title: input.todoList.title,
      items: input.todoList.items,
      completedCount: input.todoList.items.filter(
        (item: { status: string }) => item.status === "completed",
      ).length,
      totalCount: input.todoList.items.length,
    }));
    mocks.createWorkflowAgentRunRequest.mockImplementation(async (input) => ({
      id: "99999999-9999-4999-8999-999999999999",
      title: input.title,
      reason: input.reason ?? null,
      inputPreview: input.payload ?? {},
      expectedVersion: input.expectedVersion,
      status: "pending",
      expiresAt: "2099-07-23T10:00:00.000Z",
    }));
    mocks.executeCodeSandbox.mockResolvedValue({
      ok: true,
      stdout: "tests passed",
      stderr: "",
      exitCode: 0,
    });
    mocks.appendWorkflowAgentMessage.mockImplementation(async (input) => ({
      id: crypto.randomUUID(),
      role: input.role,
      content: input.content,
      createdAt: new Date().toISOString(),
    }));
    mocks.searchWebWithSearxng.mockResolvedValue({
      ok: true,
      query: "Build a summary workflow",
      results: [],
    });
    mocks.getAgentDefaultPreferences.mockResolvedValue({
      organizationDefaultAgentId: agentId,
      userDefaultAgentId: null,
      effectiveDefaultAgentId: agentId,
    });
    mocks.getActiveVersion.mockResolvedValue({
      id: versionId,
      maxOutputTokens: 4_000,
      temperature: null,
      topP: null,
    });
    mocks.resolveProviderForVersion.mockResolvedValue({
      providerKind: "openai-compatible",
      providerId: "provider-1",
      modelId: "model-1",
      runtimeConfig: {},
    });
    mocks.createChatModel.mockReturnValue(
      new MockLanguageModelV4({
        modelId: "model-1",
        doStream: [
          {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "tool-plan",
                  toolName: "set_workflow_plan",
                  input: JSON.stringify({
                    summary: "Build and verify a summary workflow",
                    steps: ["Build the graph", "Validate the connections"],
                    tests: ["Exercise the summary template"],
                  }),
                },
                {
                  type: "finish",
                  usage: modelUsage,
                  finishReason: {
                    unified: "tool-calls",
                    raw: "tool_calls",
                  },
                },
              ],
            }),
          },
          {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "tool-todos",
                  toolName: "update_todo_list",
                  input: JSON.stringify({
                    title: "Summary workflow",
                    items: [
                      {
                        id: "build",
                        label: "Build the workflow",
                        status: "in_progress",
                      },
                      {
                        id: "test",
                        label: "Test the workflow",
                        status: "pending",
                      },
                    ],
                  }),
                },
                {
                  type: "finish",
                  usage: modelUsage,
                  finishReason: {
                    unified: "tool-calls",
                    raw: "tool_calls",
                  },
                },
              ],
            }),
          },
          {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "tool-1",
                  toolName: "replace_workflow",
                  input: JSON.stringify({
                    summary: "Added a summary step",
                    definition: generatedDefinition,
                  }),
                },
                {
                  type: "finish",
                  usage: modelUsage,
                  finishReason: {
                    unified: "tool-calls",
                    raw: "tool_calls",
                  },
                },
              ],
            }),
          },
          {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "tool-validate",
                  toolName: "validate_workflow",
                  input: "{}",
                },
                {
                  type: "finish",
                  usage: modelUsage,
                  finishReason: {
                    unified: "tool-calls",
                    raw: "tool_calls",
                  },
                },
              ],
            }),
          },
          {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "tool-sandbox",
                  toolName: "run_code_sandbox",
                  input: JSON.stringify({
                    language: "node",
                    code: "console.log('tests passed')",
                  }),
                },
                {
                  type: "finish",
                  usage: modelUsage,
                  finishReason: {
                    unified: "tool-calls",
                    raw: "tool_calls",
                  },
                },
              ],
            }),
          },
          {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "tool-dry-run",
                  toolName: "dry_run_workflow",
                  input: JSON.stringify({
                    testInput: { message: "A long message" },
                  }),
                },
                {
                  type: "finish",
                  usage: modelUsage,
                  finishReason: {
                    unified: "tool-calls",
                    raw: "tool_calls",
                  },
                },
              ],
            }),
          },
          {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                { type: "text-start", id: "text-1" },
                {
                  type: "text-delta",
                  id: "text-1",
                  delta: "The workflow is ready.",
                },
                { type: "text-end", id: "text-1" },
                {
                  type: "finish",
                  usage: modelUsage,
                  finishReason: { unified: "stop", raw: "stop" },
                },
              ],
            }),
          },
        ],
      }),
    );
    mocks.updateWorkflow.mockImplementation(async (input) => ({
      ...input,
      latestVersion: 2,
      version: 2,
      status: "draft",
    }));
  });

  it("loads persisted history and pending information for the current user", async () => {
    mocks.getWorkflowAgentHistory.mockResolvedValueOnce({
      messages: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          role: "assistant",
          content: "**Ready**",
          modelContent: "internal context",
          createdAt: "2026-07-23T10:00:00.000Z",
        },
      ],
      pendingRequests: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          title: "API details",
          description: null,
          fields: [],
          expiresAt: "2099-07-23T10:00:00.000Z",
        },
      ],
      runRequests: [],
      todoList: null,
    });
    const response = await GET(
      new NextRequest(
        `http://localhost/api/workspace/workflows/${workflowId}/agentic?workspaceId=${workspaceId}`,
      ),
      { params: Promise.resolve({ workflowId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      messages: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          role: "assistant",
          content: "**Ready**",
          createdAt: "2026-07-23T10:00:00.000Z",
        },
      ],
      pendingRequests: [
        expect.objectContaining({
          id: "88888888-8888-4888-8888-888888888888",
        }),
      ],
      runRequests: [],
      todoList: null,
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      userId,
      workspaceId,
      "workflows.view",
    );
  });

  it("repairs an incomplete visual draft, streams progress, and persists one validated version", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ workflowId }),
    });
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(events.map((event) => event.type)).toEqual([
      "agent",
      "tool_start",
      "tool_result",
      "tool_start",
      "tool_result",
      "tool_start",
      "tool_result",
      "todo_list",
      "tool_start",
      "tool_result",
      "workflow",
      "tool_start",
      "tool_result",
      "tool_start",
      "tool_result",
      "tool_start",
      "tool_result",
      "text",
      "saved",
      "done",
    ]);
    expect(mocks.searchWebWithSearxng).toHaveBeenCalledTimes(1);
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      userId,
      workspaceId,
      "workflows.update",
    );
    expect(mocks.updateWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.updateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId,
        workspaceId,
        userId,
        definition: generatedDefinition,
      }),
    );
    expect(mocks.appendWorkflowAgentMessage).toHaveBeenCalledTimes(2);
  });

  it("lets the model repair a failed connection tool call and saves the corrected graph", async () => {
    mocks.createChatModel.mockReturnValueOnce(
      new MockLanguageModelV4({
        modelId: "model-1",
        doStream: [
          toolCallStream("tool-plan", "set_workflow_plan", {
            summary: "Build and connect the summary workflow",
            steps: ["Add the summary step", "Connect and test the graph"],
            tests: ["Validate every connection"],
          }),
          toolCallStream("tool-todos", "update_todo_list", {
            title: "Summary workflow",
            items: [
              {
                id: "connect",
                label: "Connect the workflow",
                status: "in_progress",
              },
            ],
          }),
          toolCallStream("tool-nodes", "upsert_workflow_nodes", {
            summary: "Add the summary step",
            nodes: generatedDefinition.nodes.filter(
              (node) => node.id === "summary",
            ),
          }),
          toolCallStream("tool-bad-edge", "connect_workflow_nodes", {
            connections: [
              {
                source: "missing-trigger",
                target: "summary",
              },
            ],
          }),
          toolCallStream("tool-good-edge", "connect_workflow_nodes", {
            connections: [
              {
                source: "trigger",
                target: "summary",
                outcome: "",
              },
            ],
          }),
          toolCallStream("tool-validate", "validate_workflow", {}),
          toolCallStream("tool-dry-run", "dry_run_workflow", {
            testInput: { message: "Bonjour" },
          }),
          textStream("The corrected workflow is ready."),
        ],
      }),
    );

    const response = await POST(request(createStarterDefinition()), {
      params: Promise.resolve({ workflowId }),
    });
    const events = (await response.text())
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            type: string;
            id?: string;
            status?: string;
          },
      );

    expect(
      events.find(
        (event) =>
          event.type === "tool_result" && event.id === "tool-bad-edge",
      ),
    ).toMatchObject({ status: "error" });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(mocks.updateWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.updateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: expect.objectContaining({
          edges: [
            expect.objectContaining({
              source: "trigger",
              target: "summary",
              sourceHandle: null,
            }),
          ],
        }),
      }),
    );
  });

  it("uses the workflow builder assistant selected by an administrator", async () => {
    const configuredAgentId = "66666666-6666-4666-8666-666666666666";
    mocks.getConfiguredWorkflowBuilderAgentId.mockResolvedValue(
      configuredAgentId,
    );
    mocks.getAgentById.mockResolvedValue({
      id: configuredAgentId,
      name: "Admin workflow builder",
    });

    const response = await POST(request(), {
      params: Promise.resolve({ workflowId }),
    });
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; name?: string });

    expect(response.status).toBe(200);
    expect(events[0]).toEqual({
      type: "agent",
      name: "Admin workflow builder",
    });
    expect(mocks.getAgentDefaultPreferences).not.toHaveBeenCalled();
    expect(mocks.getActiveVersion).toHaveBeenCalledWith(configuredAgentId);
  });

  it("fails closed when no assistant is available", async () => {
    mocks.listAgents.mockResolvedValue([]);
    mocks.getAgentDefaultPreferences.mockResolvedValue({
      organizationDefaultAgentId: null,
      userDefaultAgentId: null,
      effectiveDefaultAgentId: null,
    });

    const response = await POST(request(), {
      params: Promise.resolve({ workflowId }),
    });

    expect(response.status).toBe(400);
    expect(mocks.createChatModel).not.toHaveBeenCalled();
    expect(mocks.updateWorkflow).not.toHaveBeenCalled();
  });
});
