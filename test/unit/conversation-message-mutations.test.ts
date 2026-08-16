import { describe, expect, it, vi } from "vitest";

import { truncateConversationMessages } from "@/modules/chat/conversation-message-mutations";

function orderedQuery(rows: Array<{ id: string }>) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

function resultQuery<T>(rows: T[]) {
  const query = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  return query;
}

function mutationQuery() {
  const query = {
    set: vi.fn(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  query.set.mockReturnValue(query);
  return query;
}

describe("conversation message truncation", () => {
  it("deletes the exact ordered suffix and clears the conversation summary", async () => {
    const messageQuery = orderedQuery([
      { id: "user-1" },
      { id: "assistant-1" },
      { id: "user-2" },
      { id: "assistant-2" },
    ]);
    const branchQuery = resultQuery([]);
    const deleteTools = mutationQuery();
    const deleteMessages = mutationQuery();
    const clearSummary = mutationQuery();
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(messageQuery)
        .mockReturnValueOnce(branchQuery),
      delete: vi
        .fn()
        .mockReturnValueOnce(deleteTools)
        .mockReturnValueOnce(deleteMessages),
      update: vi.fn().mockReturnValue(clearSummary),
    };

    const removed = await truncateConversationMessages({
      tx: tx as never,
      conversationId: "conversation-1",
      anchorMessageId: "user-1",
      includeAnchor: false,
    });

    expect(removed).toEqual(["assistant-1", "user-2", "assistant-2"]);
    expect(tx.delete).toHaveBeenCalledTimes(2);
    expect(clearSummary.set).toHaveBeenCalledWith(
      expect.objectContaining({
        summaryEncrypted: null,
        summaryThroughMessageId: null,
        summaryTokenCount: null,
        summaryUpdatedAt: null,
      }),
    );
  });

  it("archives every descendant branch anchored in the removed suffix", async () => {
    const messageQuery = orderedQuery([
      { id: "user-1" },
      { id: "assistant-1" },
      { id: "user-2" },
    ]);
    const directBranchQuery = resultQuery([{ id: "branch-1" }]);
    const childBranchQuery = resultQuery([{ id: "branch-2" }]);
    const noMoreBranchesQuery = resultQuery([]);
    const archiveBranches = mutationQuery();
    const deleteTools = mutationQuery();
    const deleteMessages = mutationQuery();
    const clearSummary = mutationQuery();
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(messageQuery)
        .mockReturnValueOnce(directBranchQuery)
        .mockReturnValueOnce(childBranchQuery)
        .mockReturnValueOnce(noMoreBranchesQuery),
      delete: vi
        .fn()
        .mockReturnValueOnce(deleteTools)
        .mockReturnValueOnce(deleteMessages),
      update: vi
        .fn()
        .mockReturnValueOnce(archiveBranches)
        .mockReturnValueOnce(clearSummary),
    };

    await truncateConversationMessages({
      tx: tx as never,
      conversationId: "conversation-1",
      anchorMessageId: "assistant-1",
      includeAnchor: true,
    });

    expect(archiveBranches.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
    expect(tx.update).toHaveBeenCalledTimes(2);
  });
});
