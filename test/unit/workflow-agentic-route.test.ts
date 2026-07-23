import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelV4Usage } from "@ai-sdk/provider";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { NextRequest } from "next/server";

import { createStarterDefinition } from "@/modules/workflows/contracts";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getWorkflowDetail: vi.fn(),
  updateWorkflow: vi.fn(),
  listAgents: vi.fn(),
  getAgentDefaultPreferences: vi.fn(),
  getActiveVersion: vi.fn(),
  resolveProviderForVersion: vi.fn(),
  createChatModel: vi.fn(),
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
  getAgentDefaultPreferences: mocks.getAgentDefaultPreferences,
  getActiveVersion: mocks.getActiveVersion,
  resolveProviderForVersion: mocks.resolveProviderForVersion,
}));

vi.mock("@/modules/agent/runtime-policy", () => ({
  createRuntimeDeadline: () => ({ signal: new AbortController().signal }),
}));

vi.mock("@/modules/workflows/use-cases", () => ({
  getWorkflowDetail: mocks.getWorkflowDetail,
  updateWorkflow: mocks.updateWorkflow,
}));

vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: () => ({ createChatModel: mocks.createChatModel }),
}));

import { POST } from "@/app/api/workspace/workflows/[workflowId]/agentic/route";

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

function request() {
  return new NextRequest(
    `http://localhost/api/workspace/workflows/${workflowId}/agentic`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        messages: [{ role: "user", content: "Build a summary workflow" }],
        draft: {
          name: "Summary workflow",
          description: null,
          definition: incompleteDefinition,
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
      "workflow",
      "text",
      "saved",
      "done",
    ]);
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
