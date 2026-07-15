import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  buildBoundTools: vi.fn(),
  getDelegationBindings: vi.fn(),
  createRun: vi.fn(),
  claimRun: vi.fn(),
  heartbeatRun: vi.fn(),
  appendStep: vi.fn(),
  completeRun: vi.fn(),
  failRun: vi.fn(),
  consumeDelegation: vi.fn(),
  readPayload: vi.fn(),
  getVisibleAgent: vi.fn(),
  getActiveVersion: vi.fn(),
  getVersion: vi.fn(),
  resolveProvider: vi.fn(),
  buildSkillsPrompt: vi.fn(),
  checkPermission: vi.fn(),
  createChatModel: vi.fn(),
  logWarning: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: mocks.generateText };
});
vi.mock("@/app/api/workspace/[agentId]/chat/route-support", () => ({
  buildBoundTools: mocks.buildBoundTools,
}));
vi.mock("@/modules/agent/delegation-use-cases", () => ({
  getDelegationBindingsForVersion: mocks.getDelegationBindings,
}));
vi.mock("@/modules/agent/run-use-cases", () => ({
  createAgentRun: mocks.createRun,
  claimAgentRun: mocks.claimRun,
  heartbeatAgentRun: mocks.heartbeatRun,
  appendAgentRunStep: mocks.appendStep,
  completeAgentRun: mocks.completeRun,
  failAgentRun: mocks.failRun,
  consumeAgentRunDelegationBudget: mocks.consumeDelegation,
  readAgentRunPayload: mocks.readPayload,
}));
vi.mock("@/modules/agent/use-cases", () => ({
  getVisibleAgentById: mocks.getVisibleAgent,
  getActiveVersion: mocks.getActiveVersion,
  getAgentVersionById: mocks.getVersion,
  resolveProviderForVersion: mocks.resolveProvider,
}));
vi.mock("@/modules/skills/use-cases", () => ({
  buildSkillsRegistryPrompt: mocks.buildSkillsPrompt,
}));
vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { checkPermission: mocks.checkPermission },
}));
vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: vi.fn(() => ({ createChatModel: mocks.createChatModel })),
}));
vi.mock("@/server/infrastructure/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mocks.logWarning },
}));

import {
  abortActiveAgentRun,
  executeAgent,
} from "@/modules/agent/runtime-executor";

const rootAgent = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  createdById: "33333333-3333-4333-8333-333333333333",
  name: "Root agent",
  kind: "assistant",
};
const rootVersion = {
  id: "44444444-4444-4444-8444-444444444444",
  agentId: rootAgent.id,
  systemPrompt: "Help",
  maxToolCalls: 0,
  maxOutputTokens: 4_000,
  orchestrationPolicyJson: null,
  approvalPolicyJson: null,
};
const provider = {
  providerId: "55555555-5555-4555-8555-555555555555",
  modelRecordId: "66666666-6666-4666-8666-666666666666",
  modelId: "model-api-id",
  providerKind: "openai",
  runtimeConfig: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkPermission.mockResolvedValue({ granted: true });
  mocks.getVisibleAgent.mockResolvedValue(rootAgent);
  mocks.getActiveVersion.mockResolvedValue(rootVersion);
  mocks.getVersion.mockResolvedValue(rootVersion);
  mocks.resolveProvider.mockResolvedValue(provider);
  mocks.createChatModel.mockReturnValue({ modelId: "test-model" });
  mocks.createRun.mockResolvedValue({
    run: { id: "77777777-7777-4777-8777-777777777777", status: "queued" },
    reused: false,
  });
  mocks.claimRun.mockResolvedValue({ id: "run", status: "running" });
  mocks.heartbeatRun.mockResolvedValue(true);
  mocks.buildBoundTools.mockResolvedValue({
    tools: {},
    toolApproval: undefined,
  });
  mocks.getDelegationBindings.mockResolvedValue([]);
  mocks.buildSkillsPrompt.mockResolvedValue(null);
  mocks.generateText.mockResolvedValue({
    text: "Completed",
    usage: { inputTokens: 10, outputTokens: 20 },
  });
  mocks.completeRun.mockResolvedValue({ status: "success" });
  mocks.failRun.mockResolvedValue(null);
  mocks.consumeDelegation.mockResolvedValue(1);
});

describe("agent runtime executor", () => {
  it("rejects agents and versions that are not visible", async () => {
    mocks.getVisibleAgent.mockResolvedValueOnce(null);

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({ code: "AGENT_NOT_FOUND" });

    mocks.getVisibleAgent.mockResolvedValueOnce(rootAgent);
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      agentId: "another-agent",
    });
    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({ code: "AGENT_VERSION_NOT_FOUND" });
  });

  it("checks chat permission before creating a run", async () => {
    mocks.checkPermission.mockResolvedValueOnce({
      granted: false,
      reason: "Missing permission: agents.chat",
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({ code: "AGENT_RUN_FORBIDDEN" });
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it("executes and settles a bounded root run", async () => {
    const result = await executeAgent({
      workspaceId: rootAgent.workspaceId,
      userId: rootAgent.createdById,
      agentId: rootAgent.id,
      prompt: "Hello",
      trigger: "api",
    });

    expect(result).toMatchObject({
      text: "Completed",
      inputTokens: 10,
      outputTokens: 20,
      totalTreeTokens: 30,
    });
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ reservationTokens: 30 }),
    );
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({ operation: "api" }),
      }),
    );
  });

  it("fails explicitly when the model loop ends without a final answer", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "   ",
      usage: { inputTokens: 4, outputTokens: 0 },
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({ code: "AGENT_EMPTY_RESPONSE" });
    expect(mocks.completeRun).not.toHaveBeenCalled();
    expect(mocks.failRun).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "AGENT_EMPTY_RESPONSE" }),
    );
  });

  it("recovers an empty final turn from successful tool results without calling another tool", async () => {
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 1,
    });
    mocks.buildBoundTools.mockResolvedValueOnce({
      tools: {
        deepwiki: {
          execute: vi.fn(async () => ({ result: "Australia release notes" })),
        },
      },
      toolApproval: undefined,
    });
    const incompatibleProviderMessages = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "deepwiki-call",
            toolName: "deepwiki",
            input: { question: "Latest ServiceNow release" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "deepwiki-call",
            toolName: "deepwiki",
            output: { type: "text", value: "Australia release notes" },
          },
        ],
      },
    ];
    mocks.generateText
      .mockResolvedValueOnce({
        text: "",
        usage: { inputTokens: 10, outputTokens: 1 },
        toolResults: [
          {
            type: "tool-result",
            toolCallId: "deepwiki-call",
            toolName: "deepwiki",
            output: {
              result: "Australia release notes",
              apiKey: "must-not-cross-the-recovery-boundary",
            },
          },
        ],
        responseMessages: incompatibleProviderMessages,
      })
      .mockResolvedValueOnce({
        text: "ServiceNow Australia is the latest release.",
        usage: { inputTokens: 20, outputTokens: 5 },
      });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Parle-moi des dernières mises à jour ServiceNow",
        trigger: "api",
      }),
    ).resolves.toMatchObject({
      text: "ServiceNow Australia is the latest release.",
      inputTokens: 30,
      outputTokens: 6,
      totalTreeTokens: 36,
    });

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    const recoveryCall = mocks.generateText.mock.calls[1][0];
    expect(recoveryCall).toEqual(
      expect.objectContaining({
        prompt: expect.stringContaining("Australia release notes"),
        telemetry: expect.objectContaining({
          functionId: "ai-hub.agent-run.empty-response-recovery",
        }),
      }),
    );
    expect(recoveryCall).not.toHaveProperty("messages");
    expect(recoveryCall).not.toHaveProperty("tools");
    expect(recoveryCall.prompt).toContain("[REDACTED]");
    expect(recoveryCall.prompt).not.toContain(
      "must-not-cross-the-recovery-boundary",
    );
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 30,
        outputTokens: 6,
        reservationTokens: 36,
      }),
    );
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "model",
        status: "success",
        outputPreview: expect.objectContaining({
          recoveredFromEmptyResponse: true,
        }),
      }),
    );
  });

  it("returns the safe tool result when the tool-free recovery also returns no text", async () => {
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 1,
    });
    mocks.buildBoundTools.mockResolvedValueOnce({
      tools: { lookup: { execute: vi.fn() } },
      toolApproval: undefined,
    });
    mocks.generateText
      .mockResolvedValueOnce({
        text: "",
        usage: { inputTokens: 4, outputTokens: 0 },
        toolResults: [{ toolName: "lookup", output: { answer: 42 } }],
        responseMessages: [],
      })
      .mockResolvedValueOnce({
        text: "   ",
        usage: { inputTokens: 5, outputTokens: 0 },
      });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Use lookup",
        trigger: "api",
      }),
    ).resolves.toMatchObject({
      text: "42",
      inputTokens: 9,
      outputTokens: 0,
      totalTreeTokens: 9,
    });
    expect(mocks.completeRun).toHaveBeenCalled();
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "model",
        status: "success",
        outputPreview: expect.objectContaining({
          recoveredFromEmptyResponse: false,
          recoveredFromToolResult: true,
        }),
      }),
    );
  });

  it("returns a completed tool result when final synthesis times out", async () => {
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 1,
      toolChoice: "required",
    });
    mocks.buildBoundTools.mockResolvedValueOnce({
      tools: {
        deepwiki: {
          execute: vi.fn(async () => ({
            result: "ServiceNow Australia release notes",
            apiKey: "must-remain-redacted",
          })),
        },
      },
      toolApproval: undefined,
    });
    mocks.generateText.mockImplementationOnce(async (options) => {
      expect(options.toolChoice).toBe("required");
      const tools = options.tools as Record<
        string,
        { execute: (input: unknown) => Promise<unknown> }
      >;
      await tools.deepwiki.execute({
        repoName: "ServiceNow/ServiceNowDocs",
        question: "Latest ServiceNow updates",
      });
      await options.onStepEnd?.({
        usage: { inputTokens: 11, outputTokens: 2 },
      });
      const timeout = new Error("The operation was aborted due to timeout");
      timeout.name = "TimeoutError";
      throw timeout;
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Latest ServiceNow updates",
        trigger: "api",
      }),
    ).resolves.toMatchObject({
      text: "ServiceNow Australia release notes",
      inputTokens: 11,
      outputTokens: 2,
      totalTreeTokens: 13,
    });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.failRun).not.toHaveBeenCalled();
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 11,
        outputTokens: 2,
        reservationTokens: 13,
      }),
    );
    const modelStep = mocks.appendStep.mock.calls.find(
      ([step]) => step.kind === "model",
    );
    expect(JSON.stringify(modelStep)).not.toContain("must-remain-redacted");
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "model",
        status: "success",
        outputPreview: expect.objectContaining({
          recoveredFromToolResult: true,
        }),
      }),
    );
  });

  it("does not recover a completed tool result after explicit user cancellation", async () => {
    const controller = new AbortController();
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 1,
    });
    mocks.buildBoundTools.mockResolvedValueOnce({
      tools: {
        lookup: {
          execute: vi.fn(async () => ({ result: "must not be returned" })),
        },
      },
      toolApproval: undefined,
    });
    mocks.generateText.mockImplementationOnce(async (options) => {
      const tools = options.tools as Record<
        string,
        { execute: (input: unknown) => Promise<unknown> }
      >;
      await tools.lookup.execute({ query: "value" });
      controller.abort("Cancelled by user");
      const timeout = new Error("The operation was aborted due to timeout");
      timeout.name = "TimeoutError";
      throw timeout;
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Use lookup",
        trigger: "api",
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "AGENT_RUN_CANCELLED" });
    expect(mocks.completeRun).not.toHaveBeenCalled();
    expect(mocks.failRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        errorCode: "AGENT_RUN_CANCELLED",
      }),
    );
  });

  it("preserves a redacted provider detail for operational logs", async () => {
    mocks.generateText.mockRejectedValueOnce(
      new Error("Provider rejected Bearer super-secret"),
    );

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({
      code: "AGENT_RUN_FAILED",
      message: "Agent run failed",
      safeDetail: "Provider rejected Bearer [REDACTED]",
    });
  });

  it("records successful and failed bound tool executions", async () => {
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 3,
    });
    mocks.buildBoundTools.mockResolvedValueOnce({
      tools: {
        lookup: {
          execute: vi.fn(async () => ({ answer: 42 })),
        },
        unstable: {
          execute: vi.fn(async () => {
            throw new Error("upstream unavailable");
          }),
        },
        metadata_only: { description: "No executable handler" },
      },
      toolApproval: undefined,
    });
    mocks.generateText.mockImplementationOnce(async (options) => {
      const tools = options.tools as Record<
        string,
        { execute?: (input: unknown) => Promise<unknown> }
      >;
      await expect(
        tools.lookup.execute?.({ query: "status" }),
      ).resolves.toEqual({ answer: 42 });
      await expect(
        tools.unstable.execute?.({ query: "status" }),
      ).rejects.toThrow("upstream unavailable");
      expect(tools.metadata_only).toEqual({
        description: "No executable handler",
      });
      return {
        text: "Completed with tools",
        usage: { inputTokens: 4, outputTokens: 5 },
      };
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Use the tools",
        trigger: "api",
      }),
    ).resolves.toMatchObject({ text: "Completed with tools" });
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "tool",
        status: "success",
        name: "lookup",
      }),
    );
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "tool",
        status: "failed",
        name: "unstable",
      }),
    );
  });

  it("emits parent tool lifecycle progress without waiting for or trusting the observer", async () => {
    const onProgress = vi
      .fn()
      .mockReturnValueOnce(new Promise<void>(() => undefined))
      .mockRejectedValueOnce(new Error("progress subscriber unavailable"));
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 1,
    });
    mocks.generateText.mockImplementationOnce(async (options) => {
      const toolCall = {
        type: "tool-call" as const,
        toolCallId: "lookup-call",
        toolName: "lookup",
        input: { query: "status" },
        dynamic: false,
      };
      await options.onToolExecutionStart?.({
        callId: "model-call",
        messages: [],
        toolCall,
        toolContext: undefined,
      });
      await options.onToolExecutionEnd?.({
        callId: "model-call",
        messages: [],
        toolCall,
        toolContext: undefined,
        toolExecutionMs: 27,
        toolOutput: {
          ...toolCall,
          type: "tool-result",
          output: { answer: 42 },
        },
      });
      return {
        text: "Completed with progress",
        usage: { inputTokens: 4, outputTokens: 5 },
      };
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Use lookup",
        trigger: "api",
        onProgress,
      }),
    ).resolves.toMatchObject({ text: "Completed with progress" });

    const context = {
      id: "77777777-7777-4777-8777-777777777777:lookup-call",
      toolCallId: "lookup-call",
      toolName: "lookup",
      agentName: rootAgent.name,
      agentId: rootAgent.id,
      runId: "77777777-7777-4777-8777-777777777777",
      parentRunId: null,
      depth: 0,
    };
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      ...context,
      type: "tool-start",
      input: { query: "status" },
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      ...context,
      type: "tool-end",
      durationMs: 27,
      output: { answer: 42 },
    });
  });

  it("emits a safe tool error in lifecycle progress", async () => {
    const onProgress = vi.fn();
    mocks.generateText.mockImplementationOnce(async (options) => {
      const toolCall = {
        type: "tool-call" as const,
        toolCallId: "unstable-call",
        toolName: "unstable",
        input: { query: "status" },
        dynamic: false,
      };
      await options.onToolExecutionEnd?.({
        callId: "model-call",
        messages: [],
        toolCall,
        toolContext: undefined,
        toolExecutionMs: 13,
        toolOutput: {
          ...toolCall,
          type: "tool-error",
          error: new Error("Request failed with Bearer super-secret"),
        },
      });
      return {
        text: "Recovered",
        usage: { inputTokens: 2, outputTokens: 3 },
      };
    });

    await executeAgent({
      workspaceId: rootAgent.workspaceId,
      userId: rootAgent.createdById,
      agentId: rootAgent.id,
      prompt: "Try the unstable tool",
      trigger: "api",
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool-end",
        toolName: "unstable",
        durationMs: 13,
        error: "Request failed with Bearer [REDACTED]",
      }),
    );
    expect(JSON.stringify(onProgress.mock.calls)).not.toContain("super-secret");
  });

  it("fails when a new run cannot be claimed", async () => {
    mocks.claimRun.mockResolvedValueOnce(null);

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({
      code: "AGENT_RUN_NOT_EXECUTABLE",
      status: "not claimable",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("does not report success when atomic completion fails", async () => {
    mocks.completeRun.mockRejectedValueOnce(new Error("usage write failed"));

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({ code: "AGENT_RUN_FAILED" });

    expect(mocks.failRun).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({ operation: "api" }),
      }),
    );
  });

  it("returns an idempotent completed result without running the model again", async () => {
    mocks.createRun.mockResolvedValueOnce({
      run: {
        id: "77777777-7777-4777-8777-777777777777",
        status: "success",
        inputTokens: 2,
        outputTokens: 3,
      },
      reused: true,
    });
    mocks.readPayload.mockResolvedValue({
      input: { prompt: "Hello" },
      output: { text: "Cached" },
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
        idempotencyKey: "request-1",
      }),
    ).resolves.toMatchObject({ text: "Cached", reused: true });
    expect(mocks.claimRun).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("rejects reuse of a run that is still active", async () => {
    mocks.createRun.mockResolvedValueOnce({
      run: {
        id: "77777777-7777-4777-8777-777777777777",
        status: "running",
      },
      reused: true,
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
        idempotencyKey: "request-active",
      }),
    ).rejects.toMatchObject({
      code: "AGENT_RUN_NOT_EXECUTABLE",
      status: "running",
    });
  });

  it("returns false when no active run can be aborted", () => {
    expect(abortActiveAgentRun("missing-run")).toBe(false);
  });

  it("rechecks delegation permission and executes the pinned child version", async () => {
    const onProgress = vi.fn();
    const childAgent = {
      ...rootAgent,
      id: "88888888-8888-4888-8888-888888888888",
      name: "Research specialist",
      kind: "assistant",
    };
    const childVersion = {
      ...rootVersion,
      id: "99999999-9999-4999-8999-999999999999",
      agentId: childAgent.id,
      maxToolCalls: 4,
    };
    const orchestrator = {
      ...rootAgent,
      kind: "orchestrator",
    };
    const orchestratorVersion = {
      ...rootVersion,
      maxToolCalls: 4,
      orchestrationPolicyJson: {
        maxDepth: 2,
        maxDelegations: 4,
        maxParallel: 2,
        maxChildSteps: 4,
        maxTotalTokens: 10_000,
        timeoutMs: 30_000,
        resultMaxChars: 4_000,
      },
    };
    mocks.getVisibleAgent
      .mockResolvedValueOnce(orchestrator)
      .mockResolvedValueOnce(childAgent);
    mocks.getActiveVersion.mockResolvedValueOnce(orchestratorVersion);
    mocks.getVersion.mockResolvedValueOnce(childVersion);
    mocks.getDelegationBindings.mockResolvedValueOnce([
      {
        childAgentId: childAgent.id,
        childAgentVersionId: childVersion.id,
        instructions: "Research",
      },
    ]);
    mocks.buildBoundTools
      .mockResolvedValueOnce({ tools: {}, toolApproval: undefined })
      .mockResolvedValueOnce({
        tools: {
          web_search: {
            execute: vi.fn(async () => ({ sourceCount: 3 })),
          },
        },
        toolApproval: undefined,
      });
    mocks.createRun
      .mockResolvedValueOnce({
        run: {
          id: "77777777-7777-4777-8777-777777777777",
          status: "queued",
        },
        reused: false,
      })
      .mockResolvedValueOnce({
        run: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          status: "queued",
        },
        reused: false,
      });
    let call = 0;
    mocks.generateText.mockImplementation(async (options) => {
      call += 1;
      if (call === 1) {
        const delegationEntry = Object.entries(options.tools).find(([name]) =>
          name.startsWith("delegate_"),
        );
        expect(delegationEntry?.[0]).toBe("delegate_specialist_1");
        const delegate = delegationEntry?.[1] as {
          description: string;
          execute: (input: { task: string }) => Promise<unknown>;
          toModelOutput: (options: {
            toolCallId: string;
            input: { task: string };
            output: unknown;
          }) => unknown;
        };
        expect(delegate.description).not.toContain(childAgent.id);
        const delegatedOutput = await delegate.execute({
          task: "Investigate",
        });
        expect(delegatedOutput).toMatchObject({
          childRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          childAgentId: childAgent.id,
          childAgentName: childAgent.name,
          result: "Child result",
        });
        const modelOutput = await delegate.toModelOutput({
          toolCallId: "delegate-call",
          input: { task: "Investigate" },
          output: delegatedOutput,
        });
        expect(modelOutput).toEqual({ type: "text", value: "Child result" });
        expect(JSON.stringify(modelOutput)).not.toContain(childAgent.id);
        expect(JSON.stringify(modelOutput)).not.toContain(childAgent.name);
        expect(JSON.stringify(modelOutput)).not.toContain(
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        );
        return {
          text: "Synthesized",
          usage: { inputTokens: 7, outputTokens: 8 },
        };
      }
      if (call === 2) {
        expect(options.system).toContain(
          "Return only the final answer needed by the parent orchestrator.",
        );
        const prepareStep = options.prepareStep as (input: {
          stepNumber: number;
        }) => unknown;
        expect(await prepareStep({ stepNumber: 2 })).toBeUndefined();
        expect(await prepareStep({ stepNumber: 3 })).toMatchObject({
          activeTools: [],
          toolChoice: "none",
        });
        const childToolCall = {
          type: "tool-call" as const,
          toolCallId: "child-tool-call",
          toolName: "web_search",
          input: { query: "Investigate" },
          dynamic: false,
        };
        await options.onToolExecutionStart?.({
          callId: "child-model-call",
          messages: [],
          toolCall: childToolCall,
          toolContext: undefined,
        });
        await options.onToolExecutionEnd?.({
          callId: "child-model-call",
          messages: [],
          toolCall: childToolCall,
          toolContext: undefined,
          toolExecutionMs: 31,
          toolOutput: {
            ...childToolCall,
            type: "tool-result",
            output: { sourceCount: 3 },
          },
        });
        return {
          text: "",
          usage: { inputTokens: 2, outputTokens: 3 },
          toolResults: [
            {
              type: "tool-result",
              toolCallId: "child-tool-call",
              toolName: "web_search",
              output: { sourceCount: 3 },
            },
          ],
          responseMessages: [
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "child-tool-call",
                  toolName: "web_search",
                  output: { type: "json", value: { sourceCount: 3 } },
                },
              ],
            },
          ],
        };
      }
      expect(options).not.toHaveProperty("tools");
      expect(options).not.toHaveProperty("messages");
      expect(options.prompt).toContain('"sourceCount":3');
      expect(options.system).toContain(
        "Your previous turn ended without a final text response",
      );
      return {
        text: "Child result",
        usage: { inputTokens: 4, outputTokens: 4 },
      };
    });

    const result = await executeAgent({
      workspaceId: rootAgent.workspaceId,
      userId: rootAgent.createdById,
      agentId: rootAgent.id,
      prompt: "Coordinate",
      trigger: "api",
      onProgress,
    });

    expect(result.totalTreeTokens).toBe(28);
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      { principalType: "user", principalId: rootAgent.createdById },
      "agents.delegate",
      "workspace",
      rootAgent.workspaceId,
    );
    expect(mocks.getVersion).toHaveBeenCalledWith(childVersion.id);
    expect(mocks.createRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        agentId: childAgent.id,
        agentVersionId: childVersion.id,
        parentRunId: "77777777-7777-4777-8777-777777777777",
        trigger: "delegation",
      }),
    );
    const rootDeadline = mocks.createRun.mock.calls[0][0].deadlineAt as Date;
    const childDeadline = mocks.createRun.mock.calls[1][0].deadlineAt as Date;
    expect(rootDeadline.getTime() - childDeadline.getTime()).toBe(7_500);
    expect(mocks.completeRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ reservationTokens: 28 }),
    );
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      type: "tool-start",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:child-tool-call",
      toolCallId: "child-tool-call",
      toolName: "web_search",
      agentName: childAgent.name,
      agentId: childAgent.id,
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      parentRunId: "77777777-7777-4777-8777-777777777777",
      depth: 1,
      modelHistoryKind: "visual-only",
      input: { query: "Investigate" },
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      type: "tool-end",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:child-tool-call",
      toolCallId: "child-tool-call",
      toolName: "web_search",
      agentName: childAgent.name,
      agentId: childAgent.id,
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      parentRunId: "77777777-7777-4777-8777-777777777777",
      depth: 1,
      modelHistoryKind: "visual-only",
      durationMs: 31,
      output: { sourceCount: 3 },
    });
  });

  it("preserves a specialist tool result when its final synthesis times out", async () => {
    const childAgent = {
      ...rootAgent,
      id: "88888888-8888-4888-8888-888888888888",
      name: "ServiceNow specialist",
      kind: "assistant",
    };
    const childVersion = {
      ...rootVersion,
      id: "99999999-9999-4999-8999-999999999999",
      agentId: childAgent.id,
      maxToolCalls: 1,
    };
    const orchestrator = {
      ...rootAgent,
      name: "ServiceNow orchestrator",
      kind: "orchestrator",
    };
    const orchestratorVersion = {
      ...rootVersion,
      maxToolCalls: 2,
      orchestrationPolicyJson: {
        maxDepth: 2,
        maxDelegations: 2,
        maxParallel: 1,
        maxChildSteps: 2,
        maxTotalTokens: 50_000,
        timeoutMs: 120_000,
        resultMaxChars: 12_000,
      },
    };
    mocks.getVisibleAgent
      .mockResolvedValueOnce(orchestrator)
      .mockResolvedValueOnce(childAgent);
    mocks.getActiveVersion.mockResolvedValueOnce(orchestratorVersion);
    mocks.getVersion.mockResolvedValueOnce(childVersion);
    mocks.getDelegationBindings.mockResolvedValueOnce([
      {
        childAgentId: childAgent.id,
        childAgentVersionId: childVersion.id,
        instructions: "Research ServiceNow release notes",
      },
    ]);
    mocks.buildBoundTools
      .mockResolvedValueOnce({ tools: {}, toolApproval: undefined })
      .mockResolvedValueOnce({
        tools: {
          deepwiki: {
            execute: vi.fn(async () => ({
              result: "Australia became generally available on May 5, 2026.",
            })),
          },
        },
        toolApproval: undefined,
      });
    mocks.createRun
      .mockResolvedValueOnce({
        run: {
          id: "77777777-7777-4777-8777-777777777777",
          status: "queued",
        },
        reused: false,
      })
      .mockResolvedValueOnce({
        run: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          status: "queued",
        },
        reused: false,
      });
    mocks.generateText.mockImplementation(async (options) => {
      const toolEntries = Object.entries(options.tools ?? {});
      const delegation = toolEntries.find(([name]) =>
        name.startsWith("delegate_"),
      );
      if (delegation) {
        const delegate = delegation[1] as {
          execute: (input: { task: string }) => Promise<{
            result: string;
          }>;
        };
        const delegated = await delegate.execute({
          task: "Cherche les dernières mises à jour ServiceNow",
        });
        expect(delegated.result).toBe(
          "Australia became generally available on May 5, 2026.",
        );
        return {
          text: `Synthèse: ${delegated.result}`,
          usage: { inputTokens: 5, outputTokens: 6 },
        };
      }

      const deepwiki = Object.fromEntries(toolEntries).deepwiki as {
        execute: (input: unknown) => Promise<unknown>;
      };
      await deepwiki.execute({
        repoName: "ServiceNow/ServiceNowDocs",
        question: "Latest updates",
      });
      await options.onStepEnd?.({
        usage: { inputTokens: 15, outputTokens: 3 },
      });
      const timeout = new Error("The operation was aborted due to timeout");
      timeout.name = "TimeoutError";
      throw timeout;
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Parle-moi des dernières mises à jour ServiceNow",
        trigger: "api",
      }),
    ).resolves.toMatchObject({
      text: "Synthèse: Australia became generally available on May 5, 2026.",
      totalTreeTokens: 29,
    });

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(mocks.failRun).not.toHaveBeenCalled();
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        output: {
          text: "Australia became generally available on May 5, 2026.",
        },
        inputTokens: 15,
        outputTokens: 3,
      }),
    );
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "delegation",
        status: "success",
        childRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );
    expect(mocks.logWarning).not.toHaveBeenCalled();
  });

  it("fails closed when delegation permission is revoked at call time", async () => {
    mocks.getVisibleAgent.mockResolvedValueOnce({
      ...rootAgent,
      kind: "orchestrator",
    });
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 2,
      orchestrationPolicyJson: {
        maxDepth: 2,
        maxDelegations: 2,
        maxParallel: 1,
        maxChildSteps: 2,
        maxTotalTokens: 5_000,
        timeoutMs: 30_000,
        resultMaxChars: 2_000,
      },
    });
    mocks.getDelegationBindings.mockResolvedValueOnce([
      {
        childAgentId: "88888888-8888-4888-8888-888888888888",
        childAgentVersionId: "99999999-9999-4999-8999-999999999999",
      },
    ]);
    mocks.checkPermission
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce({
        granted: false,
        reason: "Missing permission: agents.delegate",
      });
    mocks.generateText.mockImplementationOnce(async (options) => {
      const delegate = Object.entries(options.tools).find(([name]) =>
        name.startsWith("delegate_"),
      )?.[1] as { execute: (input: { task: string }) => Promise<unknown> };
      await delegate.execute({ task: "Blocked" });
      throw new Error("unreachable");
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Coordinate",
        trigger: "api",
      }),
    ).rejects.toMatchObject({
      code: "AGENT_DELEGATION_FORBIDDEN",
      message: "The specialist could not complete the delegated task.",
    });
    expect(mocks.getVersion).not.toHaveBeenCalled();
    expect(mocks.failRun).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "AGENT_DELEGATION_FORBIDDEN" }),
    );
    expect(mocks.logWarning).toHaveBeenCalledWith(
      "Specialist delegation failed",
      expect.objectContaining({
        errorCode: "AGENT_DELEGATION_FORBIDDEN",
        errorDetail: "Missing permission: agents.delegate",
      }),
    );
  });

  it("retains the parent recovery after a specialist exceeds the tree token budget", async () => {
    const childAgent = {
      ...rootAgent,
      id: "88888888-8888-4888-8888-888888888888",
      kind: "assistant",
    };
    const childVersion = {
      ...rootVersion,
      id: "99999999-9999-4999-8999-999999999999",
      agentId: childAgent.id,
    };
    mocks.getVisibleAgent
      .mockResolvedValueOnce({ ...rootAgent, kind: "orchestrator" })
      .mockResolvedValueOnce(childAgent);
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 2,
      orchestrationPolicyJson: {
        maxDepth: 2,
        maxDelegations: 2,
        maxParallel: 1,
        maxChildSteps: 2,
        maxTotalTokens: 1_000,
        timeoutMs: 30_000,
        resultMaxChars: 2_000,
      },
    });
    mocks.getVersion.mockResolvedValueOnce(childVersion);
    mocks.getDelegationBindings.mockResolvedValueOnce([
      {
        childAgentId: childAgent.id,
        childAgentVersionId: childVersion.id,
      },
    ]);
    mocks.createRun
      .mockResolvedValueOnce({
        run: {
          id: "77777777-7777-4777-8777-777777777777",
          status: "queued",
        },
        reused: false,
      })
      .mockResolvedValueOnce({
        run: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          status: "queued",
        },
        reused: false,
      });
    let call = 0;
    mocks.generateText.mockImplementation(async (options) => {
      call += 1;
      if (call === 1) {
        const delegate = Object.entries(options.tools).find(([name]) =>
          name.startsWith("delegate_"),
        )?.[1] as { execute: (input: { task: string }) => Promise<unknown> };
        await expect(
          delegate.execute({ task: "Research" }),
        ).rejects.toMatchObject({ code: "AGENT_TOKEN_BUDGET_EXCEEDED" });
        return {
          text: "The specialist exceeded its budget; retry with a narrower task.",
          usage: { inputTokens: 10, outputTokens: 12 },
        };
      }
      return {
        text: "Oversized specialist result",
        usage: { inputTokens: 1_100, outputTokens: 5 },
      };
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Coordinate",
        trigger: "api",
      }),
    ).resolves.toMatchObject({
      text: "The specialist exceeded its budget; retry with a narrower task.",
      totalTreeTokens: 1_127,
    });
    expect(mocks.failRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        errorCode: "AGENT_TOKEN_BUDGET_EXCEEDED",
      }),
    );
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "77777777-7777-4777-8777-777777777777",
        reservationTokens: 1_127,
      }),
    );
  });
});
