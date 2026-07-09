import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findDelegationCycle,
  insertDelegationBindingsForVersion,
  validateDelegationBindings,
} from "@/modules/agent/delegation-use-cases";
import { orchestrationPolicyDefaults } from "@/modules/agent/orchestration-policy";

type BindingExecutor = Parameters<
  typeof validateDelegationBindings
>[0]["executor"];

function createExecutor(responses: unknown[][]) {
  const queue = [...responses];
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    values: vi.fn().mockResolvedValue(undefined),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockImplementation(async () => queue.shift() ?? []);
  const executor = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
  };
  return { executor: executor as unknown as BindingExecutor, chain };
}

const parentAgentId = "11111111-1111-4111-8111-111111111111";
const childAgentId = "22222222-2222-4222-8222-222222222222";
const childVersionId = "33333333-3333-4333-8333-333333333333";
const workspaceId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const binding = { childAgentId, childAgentVersionId: childVersionId };

describe("agent delegation bindings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("detects an indirect cycle through pinned versions", async () => {
    const middleAgentId = "66666666-6666-4666-8666-666666666666";
    const middleVersionId = "77777777-7777-4777-8777-777777777777";
    const loadBindings = vi
      .fn()
      .mockResolvedValueOnce([
        {
          childAgentId: middleAgentId,
          childAgentVersionId: middleVersionId,
        },
      ])
      .mockResolvedValueOnce([
        {
          childAgentId: parentAgentId,
          childAgentVersionId: "88888888-8888-4888-8888-888888888888",
        },
      ]);

    await expect(
      findDelegationCycle({
        parentAgentId,
        bindings: [binding],
        loadBindings,
      }),
    ).resolves.toEqual([
      parentAgentId,
      childAgentId,
      middleAgentId,
      parentAgentId,
    ]);
  });

  it("rejects child versions that do not belong to the selected agent", async () => {
    const { executor } = createExecutor([
      [{ id: childAgentId }],
      [{ id: childVersionId, agentId: parentAgentId }],
    ]);

    await expect(
      validateDelegationBindings({
        parentAgentId,
        workspaceId,
        userId,
        bindings: [binding],
        policy: orchestrationPolicyDefaults,
        executor,
      }),
    ).rejects.toThrow("does not belong to the selected agent");
  });

  it("rejects agents outside the caller-visible workspace scope", async () => {
    const { executor } = createExecutor([[]]);

    await expect(
      validateDelegationBindings({
        parentAgentId,
        workspaceId,
        userId,
        bindings: [binding],
        policy: orchestrationPolicyDefaults,
        executor,
      }),
    ).rejects.toThrow("Delegated agent not found");
  });

  it("validates and inserts a pinned binding", async () => {
    const { executor, chain } = createExecutor([
      [{ id: childAgentId }],
      [{ id: childVersionId, agentId: childAgentId }],
      [],
    ]);

    await insertDelegationBindingsForVersion({
      parentAgentId,
      agentVersionId: "99999999-9999-4999-8999-999999999999",
      workspaceId,
      userId,
      bindings: [{ ...binding, instructions: "Research this topic" }],
      policy: orchestrationPolicyDefaults,
      executor,
    });

    expect(chain.values).toHaveBeenCalledWith([
      expect.objectContaining({
        childAgentId,
        childAgentVersionId: childVersionId,
        instructions: "Research this topic",
      }),
    ]);
  });

  it("rejects duplicate children and direct self-delegation without querying", async () => {
    const { executor } = createExecutor([]);
    await expect(
      validateDelegationBindings({
        parentAgentId,
        workspaceId,
        userId,
        bindings: [binding, binding],
        policy: orchestrationPolicyDefaults,
        executor,
      }),
    ).rejects.toThrow("only be added once");
    await expect(
      validateDelegationBindings({
        parentAgentId,
        workspaceId,
        userId,
        bindings: [
          {
            childAgentId: parentAgentId,
            childAgentVersionId: childVersionId,
          },
        ],
        policy: orchestrationPolicyDefaults,
        executor,
      }),
    ).rejects.toThrow("cannot delegate to itself");
    expect(executor.select).not.toHaveBeenCalled();
  });
});
