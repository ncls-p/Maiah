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
        )?.[1] as {
          execute: (input: { task: string }) => Promise<unknown>;
          toModelOutput: (options: {
            toolCallId: string;
            input: { task: string };
            output: unknown;
          }) => unknown;
        };
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
        text: "Child result",
        usage: { inputTokens: 2, outputTokens: 3 },
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

    expect(result.totalTreeTokens).toBe(20);
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
    expect(mocks.completeRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ reservationTokens: 20 }),
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
      durationMs: 31,
      output: { sourceCount: 3 },
    });
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
    ).rejects.toMatchObject({ code: "AGENT_DELEGATION_FORBIDDEN" });
    expect(mocks.getVersion).not.toHaveBeenCalled();
    expect(mocks.failRun).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "AGENT_DELEGATION_FORBIDDEN" }),
    );
  });
});
