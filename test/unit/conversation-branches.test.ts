import { beforeEach, describe, expect, it, vi } from "vitest";

type Chain = Record<
  | "select"
  | "insert"
  | "from"
  | "where"
  | "orderBy"
  | "values"
  | "returning"
  | "limit",
  ReturnType<typeof vi.fn>
>;

const dbMock = vi.hoisted(() => {
  const createChain = () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const key of ["select", "insert", "from", "where", "values"]) {
      chain[key] = vi.fn().mockReturnThis();
    }
    chain.orderBy = vi.fn().mockResolvedValue([]);
    chain.returning = vi.fn().mockResolvedValue([]);
    chain.limit = vi.fn().mockResolvedValue([]);
    return chain as Chain;
  };
  return {
    chain: createChain(),
    tx: createChain(),
    db: {
      select: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

vi.mock("@/server/infrastructure/db", () => ({
  db: dbMock.db,
}));

import {
  forkConversationAtMessage,
  forkConversationForRegeneration,
} from "@/modules/chat/conversation-branches";

const now = new Date("2026-08-12T12:00:00.000Z");
const conversation = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  agentId: "agent-1",
  agentVersionId: "version-1",
  userId: "user-1",
  title: "Original chat",
  status: "active",
  parentConversationId: null,
  branchFromMessageId: null,
  isEphemeral: false,
  ephemeralTtlMinutes: 1_440,
  expiresAt: null,
  archivedAt: null,
} as Parameters<typeof forkConversationAtMessage>[0]["source"];

function resetChain(chain: Chain) {
  for (const key of ["select", "insert", "from", "where", "values"] as const) {
    chain[key].mockReset().mockReturnThis();
  }
  chain.orderBy.mockReset().mockResolvedValue([]);
  chain.returning.mockReset().mockResolvedValue([]);
  chain.limit.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
  resetChain(dbMock.chain);
  resetChain(dbMock.tx);
  dbMock.db.select.mockReset().mockReturnValue(dbMock.chain);
  dbMock.db.transaction
    .mockReset()
    .mockImplementation((callback: (tx: Chain) => Promise<unknown>) =>
      callback(dbMock.tx),
    );
});

describe("conversation branches", () => {
  it("copies history only through the selected assistant message", async () => {
    const sourceMessages = [
      { id: "user-1", role: "user", status: "completed", createdAt: now },
      {
        id: "assistant-1",
        role: "assistant",
        status: "completed",
        createdAt: now,
      },
      { id: "user-2", role: "user", status: "completed", createdAt: now },
    ];
    dbMock.chain.orderBy.mockResolvedValueOnce(sourceMessages);
    dbMock.tx.returning
      .mockResolvedValueOnce([{ ...conversation, id: "fork-1" }])
      .mockResolvedValueOnce([{ id: "copied-user-1" }])
      .mockResolvedValueOnce([{ id: "copied-assistant-1" }]);
    dbMock.tx.orderBy.mockResolvedValue([]);

    const result = await forkConversationAtMessage({
      source: conversation,
      messageId: "assistant-1",
      userId: "user-1",
    });

    expect(result.id).toBe("fork-1");
    expect(dbMock.tx.values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        parentConversationId: "conversation-1",
        branchFromMessageId: "assistant-1",
        branchKind: "fork",
      }),
    );
    expect(dbMock.tx.returning).toHaveBeenCalledTimes(3);
  });
  it("rejects a branch point that is not a finished assistant response", async () => {
    dbMock.chain.orderBy.mockResolvedValueOnce([
      { id: "user-1", role: "user", status: "completed", createdAt: now },
    ]);
    await expect(
      forkConversationAtMessage({
        source: conversation,
        messageId: "user-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Assistant message not found");

    dbMock.chain.orderBy.mockResolvedValueOnce([
      {
        id: "assistant-1",
        role: "assistant",
        status: "streaming",
        createdAt: now,
      },
    ]);
    await expect(
      forkConversationAtMessage({
        source: conversation,
        messageId: "assistant-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Wait for the response to finish");
  });
  it("preserves the previous response when creating a regenerated version", async () => {
    dbMock.chain.orderBy.mockResolvedValueOnce([
      { id: "user-1", role: "user", status: "completed", createdAt: now },
      {
        id: "assistant-1",
        role: "assistant",
        status: "completed",
        createdAt: now,
      },
      { id: "user-2", role: "user", status: "completed", createdAt: now },
    ]);
    dbMock.tx.returning
      .mockResolvedValueOnce([{ ...conversation, id: "version-2" }])
      .mockResolvedValueOnce([{ id: "copied-user-1" }]);
    dbMock.tx.orderBy.mockResolvedValue([]);

    const result = await forkConversationForRegeneration({
      source: conversation,
      assistantMessageId: "assistant-1",
      userId: "user-1",
    });

    expect(result).toEqual({
      fork: expect.objectContaining({ id: "version-2" }),
      copiedUserMessageId: "copied-user-1",
    });
    expect(dbMock.tx.values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        parentConversationId: "conversation-1",
        branchFromMessageId: "assistant-1",
        branchKind: "response_version",
      }),
    );
    expect(dbMock.tx.returning).toHaveBeenCalledTimes(2);
  });
});
