import { beforeEach, describe, expect, it, vi } from "vitest";

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
  claimAgentRun,
  completeAgentRun,
  createAgentRun,
  failAgentRun,
  reapExpiredAgentRuns,
  requestAgentRunCancellation,
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
    dbMock.chain[method].mockReturnValue(dbMock.chain);
  }
  dbMock.chain.limit.mockResolvedValue([]);
  dbMock.chain.returning.mockResolvedValue([]);
  dbMock.db.select.mockReturnValue(dbMock.chain);
  dbMock.db.insert.mockReturnValue(dbMock.chain);
  dbMock.db.update.mockReturnValue(dbMock.chain);
  quotaMocks.reserve.mockResolvedValue({ id: "reservation-1" });
  quotaMocks.settle.mockResolvedValue(undefined);
  quotaMocks.release.mockResolvedValue(undefined);
  quotaMocks.expire.mockResolvedValue(0);
});

describe("agent run lifecycle", () => {
  it("reuses an existing idempotent run before reserving quota", async () => {
    dbMock.chain.limit.mockResolvedValueOnce([run]);

    const result = await createAgentRun({
      workspaceId: run.workspaceId,
      agentId: "33333333-3333-4333-8333-333333333333",
      agentVersionId: "44444444-4444-4444-8444-444444444444",
      actorPrincipalType: "user",
      actorPrincipalId: "55555555-5555-4555-8555-555555555555",
      trigger: "api",
      payload: { prompt: "hello" },
      requestedTokens: 2_000,
      deadlineAt: new Date(Date.now() + 60_000),
      idempotencyKey: "request-1",
    });

    expect(result).toMatchObject({ reused: true, run });
    expect(dbMock.db.insert).not.toHaveBeenCalled();
    expect(quotaMocks.reserve).not.toHaveBeenCalled();
  });

  it("encrypts raw input, stores a safe preview, and reserves root budget", async () => {
    dbMock.chain.limit.mockResolvedValueOnce([]);
    dbMock.chain.returning.mockResolvedValueOnce([run]);

    const result = await createAgentRun({
      workspaceId: run.workspaceId,
      agentId: "33333333-3333-4333-8333-333333333333",
      agentVersionId: "44444444-4444-4444-8444-444444444444",
      actorPrincipalType: "user",
      actorPrincipalId: "55555555-5555-4555-8555-555555555555",
      trigger: "api",
      payload: { prompt: "use Bearer hidden" },
      requestedTokens: 2_000,
      deadlineAt: new Date(Date.now() + 60_000),
    });

    expect(result.reused).toBe(false);
    expect(dbMock.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        inputEncrypted: 'enc:{"prompt":"use Bearer hidden"}',
        inputPreviewJson: { prompt: "use Bearer [REDACTED]" },
      }),
    );
    expect(quotaMocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ requestedTokens: 2_000 }),
    );
  });

  it("claims queued work with an expiring lease", async () => {
    dbMock.chain.returning.mockResolvedValueOnce([
      { ...run, status: "running", leaseOwner: "worker-1" },
    ]);

    await expect(
      claimAgentRun({ runId: run.id, leaseOwner: "worker-1" }),
    ).resolves.toMatchObject({ status: "running", leaseOwner: "worker-1" });
    expect(dbMock.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "running", leaseOwner: "worker-1" }),
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

  it("reaps deadlines, lost leases, and reservations atomically", async () => {
    dbMock.chain.returning
      .mockResolvedValueOnce([{ runId: run.id }])
      .mockResolvedValueOnce([{ id: run.id }])
      .mockResolvedValueOnce([{ id: "66666666-6666-4666-8666-666666666666" }]);

    await expect(reapExpiredAgentRuns()).resolves.toEqual({
      timedOut: 1,
      leaseExpired: 1,
    });

    expect(dbMock.db.transaction).toHaveBeenCalledOnce();
    expect(dbMock.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "timed_out", reservedTokens: 0 }),
    );
    expect(dbMock.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorCode: "AGENT_RUN_LEASE_EXPIRED",
      }),
    );
  });
});
