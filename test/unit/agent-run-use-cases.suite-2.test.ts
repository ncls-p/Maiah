import { beforeEach,describe,expect,it,vi } from "vitest";

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
};

const dbMock = vi.hoisted(() => {
  const chain = {} as Chain;
  for (const method of [
    "select",
    "insert",
    "update",
    "from",
    "where",
    "values",
    "set",
    "orderBy",
  ] as const) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.limit = vi.fn().mockResolvedValue([]);
  chain.returning = vi.fn().mockResolvedValue([]);
  const db = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    transaction: vi.fn(async (callback) => callback(db)),
    execute: vi.fn(),
  };
  return { chain, db };
});

const quotaMocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  settle: vi.fn(),
  release: vi.fn(),
  expire: vi.fn(),
}));

vi.mock("@/server/infrastructure/db", () => ({ db: dbMock.db }));
vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn(async (value: string) => `enc:${value}`),
  decryptValue: vi.fn(async (value: string) => value.replace(/^enc:/, "")),
}));
vi.mock("@/modules/usage/quota-reservations", () => ({
  reserveWorkspaceTokens: quotaMocks.reserve,
  settleWorkspaceTokenReservation: quotaMocks.settle,
  releaseWorkspaceTokenReservation: quotaMocks.release,
  expireWorkspaceTokenReservations: quotaMocks.expire,
}));

import {
appendAgentRunStep,
completeAgentRun,
consumeAgentRunDelegationBudget,
failAgentRun,
getAgentRun,
requestAgentRunCancellation
} from "@/modules/agent/run-use-cases";

const run = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  status: "queued",
  reservedTokens: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [
    "select",
    "insert",
    "update",
    "from",
    "where",
    "values",
    "set",
    "orderBy",
  ] as const) {
    dbMock.chain[method].mockReset().mockReturnValue(dbMock.chain);
  }
  dbMock.chain.limit.mockReset().mockResolvedValue([]);
  dbMock.chain.returning.mockReset().mockResolvedValue([]);
  dbMock.db.select.mockReturnValue(dbMock.chain);
  dbMock.db.insert.mockReturnValue(dbMock.chain);
  dbMock.db.update.mockReturnValue(dbMock.chain);
  quotaMocks.reserve.mockResolvedValue({ id: "reservation-1" });
  quotaMocks.settle.mockResolvedValue(undefined);
  quotaMocks.release.mockResolvedValue(undefined);
  quotaMocks.expire.mockResolvedValue(0);
});

describe("agent run lifecycle", () => {

  it("appends redacted run steps and consumes a bounded delegation", async () => {
    dbMock.chain.returning
      .mockResolvedValueOnce([{ id: "step-1" }])
      .mockResolvedValueOnce([{ delegationCount: 3 }])
      .mockResolvedValueOnce([]);

    await expect(
      appendAgentRunStep({
        runId: run.id,
        sequence: 1,
        kind: "tool",
        status: "failed",
        name: "external.request",
        inputPreview: { authorization: "Bearer hidden" },
        outputPreview: { ok: false },
        errorMessage: "Bearer hidden",
      }),
    ).resolves.toEqual({ id: "step-1" });
    await expect(
      consumeAgentRunDelegationBudget({
        rootRunId: run.id,
        maxDelegations: 3,
      }),
    ).resolves.toBe(3);
    await expect(
      consumeAgentRunDelegationBudget({
        rootRunId: run.id,
        maxDelegations: 3,
      }),
    ).resolves.toBeNull();
    expect(dbMock.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPreviewJson: { authorization: "[REDACTED]" },
        errorMessage: "Run step failed",
      }),
    );
  });

  it("settles successful usage and redacts terminal errors", async () => {
    dbMock.chain.returning
      .mockResolvedValueOnce([{ ...run, status: "success" }])
      .mockResolvedValueOnce([{ ...run, status: "failed" }]);

    await completeAgentRun({
      runId: run.id,
      output: { ok: true },
      inputTokens: 10,
      outputTokens: 20,
      usage: {
        workspaceId: run.workspaceId,
        userId: "55555555-5555-4555-8555-555555555555",
        agentId: "33333333-3333-4333-8333-333333333333",
        operation: "api",
      },
    });
    await failAgentRun({
      runId: run.id,
      error: new Error("Bearer hidden-token"),
    });

    expect(dbMock.db.transaction).toHaveBeenCalledTimes(2);
    expect(dbMock.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "settled",
        actualTokens: 30,
      }),
    );
    expect(dbMock.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: run.workspaceId,
        operation: "api",
        inputTokens: 10,
        outputTokens: 20,
        status: "success",
      }),
    );
    expect(dbMock.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: "Agent run failed" }),
    );
  });

  it("rejects duplicate completion and records terminal failure usage", async () => {
    dbMock.chain.returning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...run, status: "timed_out" }]);

    await expect(
      completeAgentRun({
        runId: run.id,
        output: null,
        inputTokens: -1,
        outputTokens: -1,
      }),
    ).rejects.toMatchObject({ code: "AGENT_RUN_CONFLICT" });
    await expect(
      failAgentRun({
        runId: run.id,
        status: "timed_out",
        error: new Error("deadline"),
        errorCode: "DEADLINE",
        inputTokens: 4,
        outputTokens: 6,
        usage: {
          workspaceId: run.workspaceId,
          userId: "55555555-5555-4555-8555-555555555555",
          agentId: "33333333-3333-4333-8333-333333333333",
          operation: "scheduled",
        },
      }),
    ).resolves.toMatchObject({ status: "timed_out" });
    expect(dbMock.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 4,
        outputTokens: 6,
        status: "timed_out",
      }),
    );
  });

  it("returns null when a failure races with another terminal transition", async () => {
    dbMock.chain.returning.mockResolvedValueOnce([]);

    await expect(
      failAgentRun({ runId: run.id, error: new Error("late") }),
    ).resolves.toBeNull();
  });

  it("cancels queued work and releases its reservation atomically", async () => {
    dbMock.chain.returning.mockResolvedValueOnce([
      { ...run, status: "cancelled" },
    ]);

    await expect(requestAgentRunCancellation(run.id)).resolves.toMatchObject({
      status: "cancelled",
    });

    expect(dbMock.db.transaction).toHaveBeenCalledOnce();
    expect(dbMock.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", reservedTokens: 0 }),
    );
    expect(dbMock.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "released" }),
    );
  });

  it("marks running work for cooperative cancellation", async () => {
    dbMock.chain.returning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...run, status: "running" }]);

    await expect(requestAgentRunCancellation(run.id)).resolves.toMatchObject({
      status: "running",
    });
    expect(dbMock.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ cancelRequestedAt: expect.any(Date) }),
    );
  });

  it("projects run details without exposing encrypted payloads", async () => {
    const storedRun = {
      ...run,
      inputEncrypted: "enc:secret",
      outputEncrypted: "enc:secret",
    };
    const steps = [{ id: "step-1", sequence: 1 }];
    dbMock.chain.limit.mockResolvedValueOnce([storedRun]);
    dbMock.chain.orderBy.mockResolvedValueOnce(steps);

    await expect(getAgentRun(run.id, run.workspaceId)).resolves.toEqual({
      ...storedRun,
      inputEncrypted: undefined,
      outputEncrypted: undefined,
      steps,
    });
  });
});
