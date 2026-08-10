import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = unknown[];

function query(result: QueryResult) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    for: vi.fn(),
    set: vi.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.for.mockReturnValue(chain);
  chain.set.mockReturnValue(chain);
  return chain;
}

const mocks = vi.hoisted(() => ({
  deleteChatAttachment: vi.fn(),
  info: vi.fn(),
  logHandledError: vi.fn(),
  selectResults: [] as QueryResult[],
  referenceResults: [] as QueryResult[],
  tx: {
    select: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  db: {
    transaction: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.info },
  logHandledError: mocks.logHandledError,
}));

vi.mock("@/modules/chat/attachments", () => ({
  deleteChatAttachment: mocks.deleteChatAttachment,
  isChatFileAttachment: (value: unknown) =>
    (value as { kind?: string } | null)?.kind === "file",
  isChatImageAttachment: (value: unknown) =>
    (value as { kind?: string } | null)?.kind === "image",
}));

vi.mock("@/server/infrastructure/db", () => ({ db: mocks.db }));

import { purgeExpiredEphemeralConversations } from "@/modules/chat/ephemeral-cleanup";

describe("temporary conversation cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectResults.length = 0;
    mocks.referenceResults.length = 0;
    mocks.tx.select.mockImplementation(() =>
      query(mocks.selectResults.shift() ?? []),
    );
    mocks.tx.delete.mockImplementation(() => query([]));
    mocks.tx.update.mockImplementation(() => query([]));
    mocks.db.select.mockImplementation(() =>
      query(mocks.referenceResults.shift() ?? []),
    );
    mocks.db.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) =>
        callback(mocks.tx),
    );
  });

  it("does nothing when no temporary conversation has expired", async () => {
    mocks.selectResults.push([]);

    await expect(purgeExpiredEphemeralConversations()).resolves.toEqual({
      conversationsDeleted: 0,
      attachmentsDeleted: 0,
    });

    expect(mocks.tx.delete).not.toHaveBeenCalled();
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("purges persisted activity and only unreferenced attachment objects", async () => {
    mocks.selectResults.push(
      [{ id: "conversation-1" }],
      [{ id: "message-1" }],
      [
        { metadata: { kind: "file", id: "attachment-deleted" } },
        { metadata: { kind: "file", id: "attachment-deleted" } },
        { metadata: { kind: "image", id: "attachment-referenced" } },
        { metadata: { kind: "file", id: "attachment-failed" } },
        { metadata: { kind: "other", id: "ignored" } },
      ],
    );
    mocks.referenceResults.push([], [{ id: "remaining-reference" }], []);
    mocks.deleteChatAttachment.mockImplementation(async (attachmentId) => {
      if (attachmentId === "attachment-failed") throw new Error("storage down");
    });

    await expect(
      purgeExpiredEphemeralConversations({
        now: new Date("2026-08-10T12:00:00.000Z"),
        batchSize: 999,
      }),
    ).resolves.toEqual({ conversationsDeleted: 1, attachmentsDeleted: 1 });

    expect(mocks.tx.delete).toHaveBeenCalledTimes(3);
    expect(mocks.tx.update).toHaveBeenCalledOnce();
    expect(mocks.deleteChatAttachment).toHaveBeenCalledTimes(2);
    expect(mocks.deleteChatAttachment).toHaveBeenNthCalledWith(
      1,
      "attachment-deleted",
    );
    expect(mocks.deleteChatAttachment).toHaveBeenNthCalledWith(
      2,
      "attachment-failed",
    );
    expect(mocks.logHandledError).toHaveBeenCalledWith(
      "Failed to delete an expired chat attachment",
      {
        attachmentId: "attachment-failed",
        error: "storage down",
      },
    );
    expect(mocks.info).toHaveBeenCalledWith(
      "Expired temporary conversations deleted",
      { conversationsDeleted: 1, attachmentsDeleted: 1 },
    );
  });

  it("deletes an expired conversation that does not contain messages", async () => {
    mocks.selectResults.push([{ id: "conversation-empty" }], []);

    await expect(
      purgeExpiredEphemeralConversations({ batchSize: 0 }),
    ).resolves.toEqual({ conversationsDeleted: 1, attachmentsDeleted: 0 });

    expect(mocks.tx.select).toHaveBeenCalledTimes(2);
    expect(mocks.tx.delete).toHaveBeenCalledTimes(2);
    expect(mocks.tx.update).toHaveBeenCalledOnce();
  });
});
