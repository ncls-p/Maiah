import { describe, expect, it } from "vitest";

import { touchConversation } from "@/app/[locale]/(workspace)/chat/chat-conversation-list";

describe("chat page conversation activity", () => {
  it("updates only the active conversation timestamp", () => {
    const conversations = [
      {
        id: "older",
        title: "Older conversation",
        agentId: "agent-1",
        updatedAt: "2026-08-10T10:00:00.000Z",
      },
      {
        id: "active",
        title: "Active conversation",
        agentId: "agent-1",
        updatedAt: "2026-08-10T11:00:00.000Z",
      },
    ];

    const result = touchConversation(
      conversations,
      "older",
      "2026-08-11T12:00:00.000Z",
    );

    expect(result[0]).toMatchObject({
      id: "older",
      updatedAt: "2026-08-11T12:00:00.000Z",
    });
    expect(result[1]).toBe(conversations[1]);
  });
});
