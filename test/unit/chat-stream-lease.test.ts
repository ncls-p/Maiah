import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

type ExpiredStream = { id: string; conversationId: string };

const mocks = vi.hoisted(() => {
  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve([]).then(resolve, reject),
  };
  updateChain.set.mockReturnValue(updateChain);
  updateChain.where.mockReturnValue(updateChain);

  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
  };
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);

  const insertChain = { values: vi.fn() };
  const tx = {
    update: vi.fn(() => updateChain),
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
  };
  const db = {
    update: vi.fn(() => updateChain),
    transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  return {
    db,
    insertChain,
    selectChain,
    tx,
    updateChain,
  };
});

vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn(async (value: string) => `encrypted:${value}`),
}));

vi.mock("@/server/infrastructure/db", () => ({ db: mocks.db }));

import {
  CHAT_STREAM_LEASE_MS,
  chatStreamIdempotencyKey,
  failChatStreamDueToTimeout,
  heartbeatChatStream,
  reapExpiredChatStreams,
} from "@/modules/chat/chat-stream-lease";

describe("chat stream leases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateChain.set.mockReturnValue(mocks.updateChain);
    mocks.updateChain.where.mockReturnValue(mocks.updateChain);
    mocks.updateChain.returning.mockResolvedValue([]);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.groupBy.mockResolvedValue([]);
    mocks.insertChain.values.mockResolvedValue(undefined);
  });

  it("scopes orchestrator idempotency to one stream generation", () => {
    expect(chatStreamIdempotencyKey("message-a", "generation-a")).toBe(
      "chat:message-a:generation-a",
    );
    expect(chatStreamIdempotencyKey("message-a", "generation-b")).not.toBe(
      chatStreamIdempotencyKey("message-a", "generation-a"),
    );
  });

  it("extends only a generation that still owns the streaming message", async () => {
    const now = new Date("2026-08-17T08:00:00.000Z");
    mocks.updateChain.returning
      .mockResolvedValueOnce([{ id: "message-active" }])
      .mockResolvedValueOnce([]);

    await expect(
      heartbeatChatStream("message-active", "generation-a", now),
    ).resolves.toBe(true);
    await expect(
      heartbeatChatStream("message-active", "generation-old", now),
    ).resolves.toBe(false);

    expect(mocks.updateChain.set).toHaveBeenNthCalledWith(1, {
      streamHeartbeatAt: now,
      streamLeaseExpiresAt: new Date(now.getTime() + CHAT_STREAM_LEASE_MS),
    });
  });

  it("does not open a transaction for an explicitly empty message scope", async () => {
    await expect(reapExpiredChatStreams(new Date(), [])).resolves.toEqual([]);
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it("gives lease-less legacy producers the bounded preparation grace period", async () => {
    const now = new Date("2026-08-17T08:05:00.000Z");

    await expect(reapExpiredChatStreams(now)).resolves.toEqual([]);

    const predicate = mocks.updateChain.where.mock.calls[0]?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(predicate);
    expect(query.sql).toContain('"stream_lease_expires_at" is null');
    expect(query.sql).toContain('"created_at" <');
    expect(query.params).toContain("2026-08-17T08:00:00.000Z");
  });

  it("persists one terminal error per CAS winner and touches each conversation once", async () => {
    const now = new Date("2026-08-17T08:05:00.000Z");
    const expired: ExpiredStream[] = [
      { id: "message-a", conversationId: "conversation-shared" },
      { id: "message-b", conversationId: "conversation-shared" },
      { id: "message-c", conversationId: "conversation-other" },
    ];
    mocks.updateChain.returning.mockResolvedValueOnce(expired);
    mocks.selectChain.groupBy.mockResolvedValueOnce([
      { messageId: "message-a", sortOrder: 3 },
      { messageId: "message-c", sortOrder: 0 },
    ]);

    await expect(reapExpiredChatStreams(now)).resolves.toEqual(expired);

    expect(mocks.insertChain.values).toHaveBeenCalledOnce();
    expect(mocks.insertChain.values).toHaveBeenCalledWith([
      expect.objectContaining({ messageId: "message-a", sortOrder: 4 }),
      expect.objectContaining({ messageId: "message-b", sortOrder: 0 }),
      expect.objectContaining({ messageId: "message-c", sortOrder: 1 }),
    ]);
    expect(mocks.tx.update).toHaveBeenCalledTimes(2);
    expect(mocks.updateChain.set).toHaveBeenLastCalledWith({ updatedAt: now });
  });

  it("has no secondary writes when no expired lease wins the CAS", async () => {
    mocks.updateChain.returning.mockResolvedValueOnce([]);

    await expect(reapExpiredChatStreams()).resolves.toEqual([]);

    expect(mocks.tx.select).not.toHaveBeenCalled();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
    expect(mocks.tx.update).toHaveBeenCalledOnce();
  });

  it("terminalizes exactly the generation that reached its hard runtime cap", async () => {
    const now = new Date("2026-08-17T08:30:00.000Z");
    mocks.updateChain.returning.mockResolvedValueOnce([
      { conversationId: "conversation-a" },
    ]);
    mocks.selectChain.where.mockResolvedValueOnce([{ sortOrder: 2 }]);

    await expect(
      failChatStreamDueToTimeout({
        messageId: "message-a",
        generationId: "generation-a",
        errorMessage: "Timed out",
        now,
      }),
    ).resolves.toBe(true);

    expect(mocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "message-a",
        type: "error",
        sortOrder: 3,
      }),
    );
    expect(mocks.updateChain.set).toHaveBeenNthCalledWith(1, {
      status: "failed",
      completedAt: now,
      streamLeaseExpiresAt: null,
    });
    expect(mocks.updateChain.set).toHaveBeenLastCalledWith({ updatedAt: now });
  });
});
