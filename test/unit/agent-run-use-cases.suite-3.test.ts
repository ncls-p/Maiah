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
getAgentRun,
listAgentRuns,
readAgentRunPayload,
reapExpiredAgentRuns
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

  it("returns null for missing runs and clamps list limits", async () => {
    dbMock.chain.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: run.id }])
      .mockResolvedValueOnce([]);

    await expect(getAgentRun(run.id, run.workspaceId)).resolves.toBeNull();
    await expect(
      listAgentRuns({
        workspaceId: run.workspaceId,
        agentId: "agent-1",
        limit: 500,
      }),
    ).resolves.toEqual([{ id: run.id }]);
    await expect(
      listAgentRuns({ workspaceId: run.workspaceId, limit: 0 }),
    ).resolves.toEqual([]);
    expect(dbMock.chain.limit).toHaveBeenCalledWith(100);
    expect(dbMock.chain.limit).toHaveBeenCalledWith(1);
  });

  it("decrypts stored run payloads and handles missing output", async () => {
    dbMock.chain.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { inputEncrypted: 'enc:{"prompt":"hello"}', outputEncrypted: null },
      ])
      .mockResolvedValueOnce([
        {
          inputEncrypted: 'enc:{"prompt":"hello"}',
          outputEncrypted: 'enc:{"answer":"done"}',
        },
      ]);

    await expect(readAgentRunPayload("missing")).resolves.toBeNull();
    await expect(readAgentRunPayload(run.id)).resolves.toEqual({
      input: { prompt: "hello" },
      output: null,
    });
    await expect(readAgentRunPayload(run.id)).resolves.toEqual({
      input: { prompt: "hello" },
      output: { answer: "done" },
    });
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

  it("reaps cleanly when no run or reservation is stale", async () => {
    dbMock.chain.returning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(reapExpiredAgentRuns()).resolves.toEqual({
      timedOut: 0,
      leaseExpired: 0,
    });
  });
});
