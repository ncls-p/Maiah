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
        )?.[1] as { execute: (input: { task: string }) => Promise<unknown> };
        await delegate.execute({ task: "Investigate" });
        return {
          text: "Synthesized",
          usage: { inputTokens: 7, outputTokens: 8 },
        };
      }
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
