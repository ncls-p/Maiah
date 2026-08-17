import { describe, expect, it } from "vitest";

import { canAdoptRouteConversation } from "@/lib/chat-navigation";
import {
  attachConversationLiveState,
  canonicalizeConversationActivities,
} from "@/modules/chat/conversation-list-live-state";

type Conversation = {
  id: string;
  title: string;
  isStreaming?: boolean;
  isUnread?: boolean;
};

function conversation(
  id: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return { id, title: id, ...overrides };
}

function activity(
  conversationId: string,
  status: string,
  completedAt: Date | null = null,
) {
  return {
    conversationId,
    messageId: `assistant-${conversationId}`,
    status,
    createdAt: new Date("2026-08-17T05:00:00.000Z"),
    completedAt,
  };
}

describe("chat history live-state regressions", () => {
  it("adopts an explicit conversation navigation while the previous reply streams", () => {
    const explicitNavigation = {
      routeConversationId: "conversation-b",
      activeConversationId: "conversation-a",
      // Keep the initiating state in this regression fixture. Route adoption
      // must not become coupled to it again: selecting another conversation is
      // what detaches the foreground stream and lets it continue in background.
      sending: true,
    };

    expect(canAdoptRouteConversation(explicitNavigation)).toBe(true);
  });

  it("clears stale optimistic badges when the server has no assistant activity", () => {
    const [result] = attachConversationLiveState(
      [
        conversation("conversation-a", {
          isStreaming: true,
          isUnread: true,
        }),
      ],
      [],
      [],
    );

    expect(result).toEqual({
      id: "conversation-a",
      title: "conversation-a",
      isStreaming: false,
      isUnread: false,
    });
  });

  it.each(["pending", "streaming"])(
    "treats the server %s status as live and never unread",
    (status) => {
      const [result] = attachConversationLiveState(
        [conversation("conversation-a")],
        [activity("conversation-a", status)],
        [],
      );

      expect(result).toMatchObject({
        latestAssistantMessageId: "assistant-conversation-a",
        latestAssistantStatus: status,
        latestAssistantCompletedAt: null,
        isStreaming: true,
        isUnread: false,
      });
    },
  );

  it.each(["completed", "failed", "cancelled"])(
    "marks a background %s response unread until its durable read receipt catches up",
    (status) => {
      const completedAt = new Date("2026-08-17T05:02:00.000Z");
      const [beforeRead] = attachConversationLiveState(
        [conversation("conversation-a")],
        [activity("conversation-a", status, completedAt)],
        [
          {
            conversationId: "conversation-a",
            lastReadAt: new Date("2026-08-17T05:01:59.999Z"),
          },
        ],
      );
      const [afterRead] = attachConversationLiveState(
        [conversation("conversation-a")],
        [activity("conversation-a", status, completedAt)],
        [
          {
            conversationId: "conversation-a",
            lastReadAt: completedAt,
          },
        ],
      );

      expect(beforeRead).toMatchObject({
        isStreaming: false,
        isUnread: true,
      });
      expect(afterRead).toMatchObject({
        isStreaming: false,
        isUnread: false,
      });
    },
  );

  it("does not invent an unread reply for incomplete or unknown terminal metadata", () => {
    const results = attachConversationLiveState(
      [conversation("missing-completion"), conversation("unknown-status")],
      [
        activity("missing-completion", "completed"),
        activity(
          "unknown-status",
          "provider-specific-status",
          new Date("2026-08-17T05:02:00.000Z"),
        ),
      ],
      [],
    );

    expect(results).toEqual([
      expect.objectContaining({
        id: "missing-completion",
        isStreaming: false,
        isUnread: false,
      }),
      expect.objectContaining({
        id: "unknown-status",
        isStreaming: false,
        isUnread: false,
      }),
    ]);
  });

  it("keeps live and read state isolated between conversations", () => {
    const completedAt = new Date("2026-08-17T05:02:00.000Z");
    const results = attachConversationLiveState(
      [conversation("streaming"), conversation("unread"), conversation("read")],
      [
        activity("streaming", "streaming"),
        activity("unread", "completed", completedAt),
        activity("read", "completed", completedAt),
      ],
      [{ conversationId: "read", lastReadAt: completedAt }],
    );

    expect(
      results.map(({ id, isStreaming, isUnread }) => ({
        id,
        isStreaming,
        isUnread,
      })),
    ).toEqual([
      { id: "streaming", isStreaming: true, isUnread: false },
      { id: "unread", isStreaming: false, isUnread: true },
      { id: "read", isStreaming: false, isUnread: false },
    ]);
  });

  it("projects a regenerated response onto its visible thread while preserving the branch to open", () => {
    const completedAt = new Date("2026-08-17T05:02:00.000Z");
    const activities = canonicalizeConversationActivities(
      [activity("response-version", "completed", completedAt)],
      new Map([["response-version", "visible-thread"]]),
    );

    const [result] = attachConversationLiveState(
      [conversation("visible-thread")],
      activities,
      [],
    );

    expect(result).toMatchObject({
      id: "visible-thread",
      latestAssistantConversationId: "response-version",
      latestAssistantMessageId: "assistant-response-version",
      isStreaming: false,
      isUnread: true,
    });
  });
});
