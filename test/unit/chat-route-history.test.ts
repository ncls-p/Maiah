import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  decryptValue: vi.fn(),
}));

vi.mock("@/server/infrastructure/db", () => ({
  db: { select: mocks.select },
}));
vi.mock("@/lib/crypto", () => ({
  decryptValue: mocks.decryptValue,
}));

import { loadConversationHistory } from "@/app/api/workspace/[agentId]/chat/route-history";

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

describe("orchestrator conversation history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptValue.mockImplementation(async (value: string) => value);
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
      toolName: "delegate_88888888888848888888888888888888",
      output: {
        childRunId: "private-child-run",
        childAgentId: "private-child-agent",
        childAgentName: "Private specialist",
        result: "FINAL CHILD RESPONSE",
      },
      agentContext: {
        agentId: "root-agent",
        agentName: "Root orchestrator",
        runId: "root-run",
        depth: 0,
        status: "success",
      },
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
            contentEncrypted: JSON.stringify(delegationResult),
            metadataJson: null,
            sortOrder: 1,
          },
          {
            messageId: assistantMessageId,
            type: "text",
            contentEncrypted: "PARENT SYNTHESIS",
            metadataJson: null,
            sortOrder: 2,
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
    expect(serializedHistory).not.toContain("private-child");
    expect(serializedHistory).not.toContain("Private specialist");
  });
});
