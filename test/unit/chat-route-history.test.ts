import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  decryptValue: vi.fn(),
  getChatImageAttachmentBytes: vi.fn(),
}));

vi.mock("@/server/infrastructure/db", () => ({
  db: { select: mocks.select },
}));
vi.mock("@/lib/crypto", () => ({
  decryptValue: mocks.decryptValue,
}));
vi.mock("@/modules/chat/attachments", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/chat/attachments")>();
  return {
    ...actual,
    getChatImageAttachmentBytes: mocks.getChatImageAttachmentBytes,
  };
});

import {
  loadConversationHistory,
  mergeHistoryWithAttachmentMessages,
} from "@/app/api/workspace/[agentId]/chat/route-history";

function selectRows(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockResolvedValue(rows);
  return query;
}

function selectLimitedRows(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockResolvedValue(rows);
  return query;
}

function selectJoinedRows(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockResolvedValue(rows);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decryptValue.mockImplementation(async (value: string) => value);
});

describe("orchestrator conversation history", () => {
  it("keeps attachment-bearing turns outside the recent history window", () => {
    const oldAttachmentTurn = {
      id: "old-file-turn",
      role: "user",
      createdAt: new Date("2026-07-01T10:00:00Z"),
    };
    const recentTurn = {
      id: "recent-turn",
      role: "user",
      createdAt: new Date("2026-07-13T10:00:00Z"),
    };

    expect(
      mergeHistoryWithAttachmentMessages(
        [recentTurn],
        [oldAttachmentTurn, oldAttachmentTurn],
      ).map((message) => message.id),
    ).toEqual(["old-file-turn", "recent-turn"]);
  });
  it("excludes the in-progress response before applying the message limit", async () => {
    const boundedHistoryQuery = selectLimitedRows([
      {
        id: "previous-assistant",
        role: "assistant",
        createdAt: new Date("2026-08-16T08:13:00Z"),
      },
      {
        id: "current-user",
        role: "user",
        createdAt: new Date("2026-08-16T08:21:00Z"),
      },
    ]);
    mocks.select
      .mockReturnValueOnce(boundedHistoryQuery)
      .mockReturnValueOnce(selectJoinedRows([]))
      .mockReturnValueOnce(
        selectRows([
          {
            messageId: "previous-assistant",
            type: "text",
            contentEncrypted: "Tell me your model and workload.",
            metadataJson: null,
            sortOrder: 0,
          },
          {
            messageId: "current-user",
            type: "text",
            contentEncrypted: "Summarize our conversation.",
            metadataJson: null,
            sortOrder: 0,
          },
        ]),
      );

    const history = await loadConversationHistory(
      "conversation",
      { workspaceId: "workspace", userId: "user" },
      { maxMessages: 2 },
    );

    expect(history).toEqual([
      { role: "assistant", content: "Tell me your model and workload." },
      { role: "user", content: "Summarize our conversation." },
    ]);
    const condition = boundedHistoryQuery.where.mock.calls[0]?.[0];
    const compiled = new PgDialect().sqlToQuery(condition);
    expect(compiled.params).toEqual(
      expect.arrayContaining(["pending", "streaming"]),
    );
  });
});
