import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertChain = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
  };
  insertChain.values.mockReturnValue(insertChain);
  const db = { insert: vi.fn(() => insertChain) };
  return { db, insertChain };
});

vi.mock("@/server/infrastructure/db", () => ({ db: mocks.db }));

import { markConversationRead } from "@/modules/chat/conversation-read-state";

describe("conversation read receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertChain.values.mockReturnValue(mocks.insertChain);
    mocks.insertChain.onConflictDoUpdate.mockResolvedValue(undefined);
  });

  it("upserts a monotonic receipt for one user and conversation", async () => {
    const readAt = new Date("2026-08-17T08:05:00.000Z");

    await markConversationRead("conversation-a", "user-a", readAt);

    expect(mocks.db.insert).toHaveBeenCalledOnce();
    expect(mocks.insertChain.values).toHaveBeenCalledWith({
      conversationId: "conversation-a",
      userId: "user-a",
      lastReadAt: readAt,
      updatedAt: readAt,
    });
    expect(mocks.insertChain.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.any(Array),
        set: {
          lastReadAt: expect.anything(),
          updatedAt: expect.anything(),
        },
      }),
    );
  });

  it("uses the current time when the caller omits a receipt timestamp", async () => {
    const now = new Date("2026-08-17T08:06:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      await markConversationRead("conversation-b", "user-b");
      expect(mocks.insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ lastReadAt: now, updatedAt: now }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
