import { describe, expect, it } from "vitest";

import { updateUnreadConversationIds } from "@/lib/workspace-history-unread";
import { canonicalizeConversationActivities } from "@/modules/chat/conversation-list-live-state";

function activity(
  conversationId: string,
  messageId: string,
  createdAt: string,
) {
  return {
    conversationId,
    messageId,
    status: "completed",
    createdAt: new Date(createdAt),
    completedAt: new Date(createdAt),
  };
}

describe("conversation list live-state edge cases", () => {
  it("keeps the newest canonical activity and breaks timestamp ties by message id", () => {
    const result = canonicalizeConversationActivities(
      [
        activity("direct", "direct-old", "2026-08-17T08:00:00.000Z"),
        activity("direct", "direct-new", "2026-08-17T08:01:00.000Z"),
        activity("branch-a", "assistant-a", "2026-08-17T08:02:00.000Z"),
        activity("branch-b", "assistant-b", "2026-08-17T08:02:00.000Z"),
      ],
      new Map([
        ["branch-a", "visible-thread"],
        ["branch-b", "visible-thread"],
      ]),
    );

    expect(result).toEqual([
      expect.objectContaining({
        conversationId: "direct",
        sourceConversationId: "direct",
        messageId: "direct-new",
      }),
      expect.objectContaining({
        conversationId: "visible-thread",
        sourceConversationId: "branch-b",
        messageId: "assistant-b",
      }),
    ]);
  });

  it("removes unread state without mutating the previous snapshot", () => {
    const current = new Set(["conversation-a", "conversation-b"]);
    const next = updateUnreadConversationIds(current, "conversation-a", false);

    expect([...current]).toEqual(["conversation-a", "conversation-b"]);
    expect([...next]).toEqual(["conversation-b"]);
  });
});
