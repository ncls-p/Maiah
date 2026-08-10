import { describe, expect, it } from "vitest";

import {
  latestConversationIdFromList,
  normalizeConversationList,
} from "@/app/[locale]/(workspace)/chat/chat-conversation-list";

const conversations = [
  {
    id: "pinned-old",
    title: "Pinned",
    agentId: "agent-old",
    pinnedAt: "2026-07-13T12:00:00.000Z",
    updatedAt: "2026-07-10T12:00:00.000Z",
  },
  {
    id: "actual-latest",
    title: "Latest",
    agentId: "agent-latest",
    updatedAt: "2026-07-13T12:00:00.000Z",
  },
];

describe("chat page conversation activity", () => {
  it("finds the latest activity independently from sidebar order", () => {
    expect(latestConversationIdFromList(conversations)).toBe("actual-latest");
  });

  it("keeps the server-owned latest conversation when it is outside the page", () => {
    expect(
      normalizeConversationList({
        conversations: [conversations[0]],
        folders: [],
        latestConversationId: "actual-latest",
        latestConversationAgentId: "agent-latest",
        hasMore: true,
        nextCursor: "cursor",
      }),
    ).toMatchObject({
      latestConversationId: "actual-latest",
      latestConversationAgentId: "agent-latest",
    });
  });
});
