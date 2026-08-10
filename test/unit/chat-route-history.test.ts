import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("orchestrator conversation history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptValue.mockImplementation(async (value: string) => value);
  });

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

  it("reads an older attached file on a later bounded conversation turn", async () => {
    const oldMessage = {
      id: "old-file-turn",
      role: "user",
      createdAt: new Date("2026-07-01T10:00:00Z"),
    };
    const recentMessage = {
      id: "recent-assistant-turn",
      role: "assistant",
      createdAt: new Date("2026-07-13T10:00:00Z"),
    };
    const attachment = {
      kind: "chat_file",
      id: "00000000-0000-4000-8000-000000000099",
      fileName: "brief.pdf",
      mimeType: "application/pdf",
      size: 123,
      hash: "hash",
      url: "/attachment",
      category: "document",
      extractionStatus: "readable",
      extractedTextChars: 26,
    };
    mocks.select
      .mockReturnValueOnce(selectLimitedRows([recentMessage]))
      .mockReturnValueOnce(selectJoinedRows([oldMessage]))
      .mockReturnValueOnce(
        selectRows([
          {
            messageId: oldMessage.id,
            type: "text",
            contentEncrypted: "Please keep this file available.",
            metadataJson: null,
            sortOrder: 0,
          },
          {
            messageId: oldMessage.id,
            type: "file",
            contentEncrypted: null,
            metadataJson: attachment,
            sortOrder: 1,
          },
          {
            messageId: recentMessage.id,
            type: "text",
            contentEncrypted: "Recent answer",
            metadataJson: null,
            sortOrder: 0,
          },
        ]),
      );

    const history = await loadConversationHistory(
      "conversation",
      { workspaceId: "workspace", userId: "user" },
      1,
    );

    expect(history).toHaveLength(2);
    expect(JSON.stringify(history[0])).toContain(
      "Embedding-free document explorer",
    );
    expect(JSON.stringify(history[0])).not.toContain(
      "EXTRACTED OLD FILE CONTENT",
    );
  });

  it("keeps child traces out and retains only their final response", async () => {
    const assistantMessageId = "assistant-message";
    const childTrace = {
      toolCallId: "child-run:child-tool-call",
      toolName: "run_code_sandbox",
      output: {
        kind: "code_sandbox_result",
        language: "typescript",
        ok: true,
        stdout: "PRIVATE CHILD TOOL OUTPUT",
      },
      agentContext: {
        agentId: "private-child-agent",
        agentName: "Private specialist",
        runId: "private-child-run",
        parentRunId: "root-run",
        depth: 1,
        status: "success",
      },
    };
    const delegationResult = {
      toolCallId: "root-run:delegate-call",
      toolName: "delegate_specialist_1",
      output: {
        childRunId: "private-child-run",
        childAgentId: "private-child-agent",
        childAgentName: "Private specialist",
        result: "FINAL CHILD RESPONSE",
      },
      modelHistoryKind: "delegation-result",
      agentContext: {
        agentId: "root-agent",
        agentName: "Root orchestrator",
        runId: "root-run",
        depth: 0,
        status: "success",
      },
    };
    const malformedVisualTrace = {
      toolCallId: "child-run:malformed-tool-call",
      toolName: "run_code_sandbox",
      output: {
        kind: "code_sandbox_result",
        language: "typescript",
        ok: true,
        stdout: "PRIVATE MALFORMED CHILD OUTPUT",
      },
      modelHistoryKind: "visual-only",
      agentContext: { depth: "invalid" },
    };

    mocks.select
      .mockReturnValueOnce(
        selectRows([
          {
            id: assistantMessageId,
            role: "assistant",
            createdAt: new Date("2026-07-10T12:00:00Z"),
          },
        ]),
      )
      .mockReturnValueOnce(
        selectRows([
          {
            messageId: assistantMessageId,
            type: "tool-result",
            contentEncrypted: JSON.stringify(childTrace),
            metadataJson: null,
            sortOrder: 0,
          },
          {
            messageId: assistantMessageId,
            type: "tool-result",
            contentEncrypted: JSON.stringify(malformedVisualTrace),
            metadataJson: null,
            sortOrder: 1,
          },
          {
            messageId: assistantMessageId,
            type: "tool-result",
            contentEncrypted: JSON.stringify(delegationResult),
            metadataJson: null,
            sortOrder: 2,
          },
          {
            messageId: assistantMessageId,
            type: "text",
            contentEncrypted: "PARENT SYNTHESIS",
            metadataJson: null,
            sortOrder: 3,
          },
        ]),
      );

    const history = await loadConversationHistory("conversation", {
      workspaceId: "workspace",
      userId: "user",
    });
    const serializedHistory = JSON.stringify(history);

    expect(history).toEqual([
      {
        role: "assistant",
        content: "FINAL CHILD RESPONSE\nPARENT SYNTHESIS",
      },
    ]);
    expect(serializedHistory).not.toContain("PRIVATE CHILD TOOL OUTPUT");
    expect(serializedHistory).not.toContain("PRIVATE MALFORMED CHILD OUTPUT");
    expect(serializedHistory).not.toContain("private-child");
    expect(serializedHistory).not.toContain("Private specialist");
  });
});
