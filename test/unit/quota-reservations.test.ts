import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const insertResults: unknown[][] = [];
  const updateResults: unknown[][] = [];
  const values = vi.fn();
  const sets = vi.fn();

  function query(result: unknown[]) {
    const chain = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      values: vi.fn(),
      set: vi.fn(),
      returning: vi.fn(),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.limit.mockResolvedValue(result);
    chain.values.mockImplementation((value) => {
      values(value);
      return chain;
    });
    chain.set.mockImplementation((value) => {
      sets(value);
      return chain;
    });
    chain.returning.mockResolvedValue(result);
    return chain;
  }

  const db = {
    select: vi.fn(() => query(selectResults.shift() ?? [])),
    insert: vi.fn(() => query(insertResults.shift() ?? [])),
    update: vi.fn(() => query(updateResults.shift() ?? [])),
    execute: vi.fn(),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(db),
    ),
  };

  return {
    db,
    insertResults,
    selectResults,
    sets,
    updateResults,
    values,
  };
});

const quotaConfig = vi.hoisted(() => ({ limit: vi.fn(() => 100) }));

vi.mock("@/server/infrastructure/db", () => ({ db: database.db }));
vi.mock("@/modules/usage/quota-config", () => ({
  getWorkspaceMonthlyTokenLimit: quotaConfig.limit,
}));

import {
  evaluateQuotaReservation,
  expireWorkspaceTokenReservations,
  getActiveWorkspaceReservationTokens,
  releaseWorkspaceTokenReservation,
  reserveWorkspaceTokens,
  settleWorkspaceTokenReservation,
  startOfQuotaMonth,
  WorkspaceQuotaReservationError,
} from "@/modules/usage/quota-reservations";

beforeEach(() => {
  vi.clearAllMocks();
  database.selectResults.length = 0;
  database.insertResults.length = 0;
  database.updateResults.length = 0;
  quotaConfig.limit.mockReturnValue(100);
});

describe("workspace token reservations", () => {
  it("admits a reservation that fits after usage and active holds", () => {
    expect(
      evaluateQuotaReservation({
        limit: 100_000,
        used: 40_000,
        reserved: 10_000,
        requested: 20_000,
      }),
    ).toMatchObject({ allowed: true, requested: 20_000 });
    expect(
      evaluateQuotaReservation({
        limit: null,
        used: 100,
        reserved: 100,
        requested: 0.5,
      }),
    ).toMatchObject({ allowed: true, requested: 1 });
  });

  it("denies overbooking even when settled usage alone is below the limit", () => {
    expect(
      evaluateQuotaReservation({
        limit: 100_000,
        used: 40_000,
        reserved: 50_000,
        requested: 20_000,
      }),
    ).toMatchObject({ allowed: false });
  });

  it("normalizes the UTC accounting period", () => {
    expect(startOfQuotaMonth(new Date("2026-07-19T12:34:56Z"))).toEqual(
      new Date("2026-07-01T00:00:00Z"),
    );
  });

  it("provides a machine-readable quota error", () => {
    const error = new WorkspaceQuotaReservationError(
      40_000,
      50_000,
      20_000,
      100_000,
    );
    expect(error.code).toBe("WORKSPACE_TOKEN_QUOTA_EXCEEDED");
    expect(error.message).toContain("20,000 requested");
  });

  it("reads active reservation totals defensively", async () => {
    database.selectResults.push([{ total: "42" }], []);

    await expect(
      getActiveWorkspaceReservationTokens("workspace-1"),
    ).resolves.toBe(42);
    await expect(
      getActiveWorkspaceReservationTokens("workspace-1"),
    ).resolves.toBe(0);
  });

  it("reuses an existing reservation for the same run", async () => {
    const existing = { id: "reservation-1", runId: "run-1" };
    database.selectResults.push([existing]);

    await expect(
      reserveWorkspaceTokens({
        workspaceId: "workspace-1",
        runId: "run-1",
        requestedTokens: 10,
        expiresAt: new Date("2026-08-01T00:00:00Z"),
      }),
    ).resolves.toEqual(existing);
    expect(database.db.insert).not.toHaveBeenCalled();
  });

  it("serializes admission and persists an allowed reservation", async () => {
    const reservation = { id: "reservation-1", reservedTokens: 30 };
    database.selectResults.push([], [{ total: 40 }], [{ total: 20 }]);
    database.insertResults.push([reservation]);
    database.updateResults.push([]);

    await expect(
      reserveWorkspaceTokens({
        workspaceId: "workspace-1",
        runId: "run-1",
        requestedTokens: 30.9,
        expiresAt: new Date("2026-08-01T00:00:00Z"),
        now: new Date("2026-07-10T00:00:00Z"),
      }),
    ).resolves.toEqual(reservation);

    expect(database.db.execute).toHaveBeenCalledOnce();
    expect(database.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        runId: "run-1",
        reservedTokens: 30,
      }),
    );
    expect(database.sets).toHaveBeenCalledWith(
      expect.objectContaining({ reservedTokens: 30 }),
    );
  });

  it("rejects a reservation that would overbook the workspace", async () => {
    database.selectResults.push([], [{ total: 80 }], [{ total: 10 }]);

    await expect(
      reserveWorkspaceTokens({
        workspaceId: "workspace-1",
        runId: "run-1",
        requestedTokens: 20,
        expiresAt: new Date("2026-08-01T00:00:00Z"),
      }),
    ).rejects.toMatchObject({
      code: "WORKSPACE_TOKEN_QUOTA_EXCEEDED",
      used: 80,
      reserved: 10,
      requested: 20,
      limit: 100,
    });
    expect(database.db.insert).not.toHaveBeenCalled();
  });

  it("settles and releases reservations with normalized token values", async () => {
    database.updateResults.push([], [], [], []);

    await settleWorkspaceTokenReservation({
      runId: "run-1",
      actualTokens: -10,
      now: new Date("2026-07-10T00:00:00Z"),
    });
    await releaseWorkspaceTokenReservation(
      "run-2",
      new Date("2026-07-10T00:00:00Z"),
    );

    expect(database.sets).toHaveBeenCalledWith(
      expect.objectContaining({ status: "settled", actualTokens: 0 }),
    );
    expect(database.sets).toHaveBeenCalledWith(
      expect.objectContaining({ status: "released" }),
    );
    expect(database.sets).toHaveBeenCalledWith(
      expect.objectContaining({ reservedTokens: 0 }),
    );
  });

  it("expires holds and clears their run reservations", async () => {
    database.updateResults.push(
      [{ runId: "run-1" }, { runId: "run-2" }],
      [],
      [],
    );

    await expect(
      expireWorkspaceTokenReservations(new Date("2026-07-10T00:00:00Z")),
    ).resolves.toBe(2);
    await expect(expireWorkspaceTokenReservations()).resolves.toBe(0);

    expect(database.sets).toHaveBeenCalledWith(
      expect.objectContaining({ status: "expired" }),
    );
    expect(database.sets).toHaveBeenCalledWith(
      expect.objectContaining({ reservedTokens: 0 }),
    );
  });
});
