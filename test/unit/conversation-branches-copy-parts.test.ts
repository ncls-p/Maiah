import { beforeEach, describe, expect, it, vi } from "vitest";

type Chain = Record<
  "select" | "insert" | "from" | "where" | "orderBy" | "values" | "returning",
  ReturnType<typeof vi.fn>
>;

const mocks = vi.hoisted(() => {
  const createChain = () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const key of ["select", "insert", "from", "where", "values"]) {
      chain[key] = vi.fn().mockReturnThis();
    }
    chain.orderBy = vi.fn().mockResolvedValue([]);
    chain.returning = vi.fn().mockResolvedValue([]);
    return chain as Chain;
  };
  return {
    query: createChain(),
    transaction: createChain(),
    db: {
      select: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

vi.mock("@/server/infrastructure/db", () => ({ db: mocks.db }));

import {
  forkConversationAtMessage,
  forkConversationForRegeneration,
} from "@/modules/chat/conversation-branches";

describe("conversation branch message-part copying", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const chain of [mocks.query, mocks.transaction]) {
      for (const key of [
        "select",
        "insert",
        "from",
        "where",
        "values",
      ] as const) {
        chain[key].mockReturnValue(chain);
      }
      chain.orderBy.mockResolvedValue([]);
      chain.returning.mockResolvedValue([]);
    }
    mocks.db.select.mockReturnValue(mocks.query);
    mocks.db.transaction.mockImplementation(
      (callback: (tx: Chain) => Promise<unknown>) =>
        callback(mocks.transaction),
    );
  });

  it("copies persisted message parts with the newly assigned message id", async () => {
    const createdAt = new Date("2026-08-17T08:00:00.000Z");
    mocks.query.orderBy.mockResolvedValueOnce([
      {
        id: "assistant-source",
        role: "assistant",
        status: "completed",
        createdAt,
      },
    ]);
    mocks.transaction.returning
      .mockResolvedValueOnce([{ id: "fork" }])
      .mockResolvedValueOnce([{ id: "assistant-copy" }]);
    mocks.transaction.orderBy.mockResolvedValueOnce([
      {
        type: "text",
        contentEncrypted: "encrypted-content",
        metadataJson: { source: "fixture" },
        sortOrder: 3,
        createdAt,
      },
    ]);

    await forkConversationAtMessage({
      source: {
        id: "source",
        workspaceId: "workspace",
        agentId: "agent",
        agentVersionId: "version",
        userId: "user",
        title: "Source",
        status: "active",
        parentConversationId: null,
        branchFromMessageId: null,
        branchKind: null,
        isEphemeral: false,
        ephemeralTtlMinutes: 1_440,
        expiresAt: null,
        archivedAt: null,
        createdAt,
        updatedAt: createdAt,
      } as Parameters<typeof forkConversationAtMessage>[0]["source"],
      messageId: "assistant-source",
      userId: "user",
    });

    expect(mocks.transaction.values).toHaveBeenNthCalledWith(3, [
      {
        messageId: "assistant-copy",
        type: "text",
        contentEncrypted: "encrypted-content",
        metadataJson: { source: "fixture" },
        sortOrder: 3,
        createdAt,
      },
    ]);
  });

  it("rejects regeneration while the requested assistant is unfinished", async () => {
    mocks.query.orderBy.mockResolvedValueOnce([
      { id: "assistant", role: "assistant", status: "streaming" },
    ]);

    await expect(
      forkConversationForRegeneration({
        source: { id: "source" } as Parameters<
          typeof forkConversationForRegeneration
        >[0]["source"],
        assistantMessageId: "assistant",
        userId: "user",
      }),
    ).rejects.toThrow("Assistant message is not ready for regeneration");
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it("rejects regeneration when no user prompt precedes the assistant", async () => {
    mocks.query.orderBy.mockResolvedValueOnce([
      { id: "assistant", role: "assistant", status: "completed" },
    ]);

    await expect(
      forkConversationForRegeneration({
        source: { id: "source", branchKind: null } as Parameters<
          typeof forkConversationForRegeneration
        >[0]["source"],
        assistantMessageId: "assistant",
        userId: "user",
      }),
    ).rejects.toThrow("User prompt for regeneration not found");
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });
});
