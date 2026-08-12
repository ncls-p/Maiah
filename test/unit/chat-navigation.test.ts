import { describe, expect, it } from "vitest";

import { createChatHref } from "@/lib/chat-navigation";

describe("createChatHref", () => {
  it("keeps the selected assistant when starting a conversation", () => {
    expect(createChatHref({ agentId: "agent-code" })).toBe(
      "/chat?agentId=agent-code",
    );
  });

  it("preserves a localized pathname for in-page chat state", () => {
    expect(
      createChatHref({
        pathname: "/fr/chat",
        agentId: "agent-fast",
        conversationId: "conversation-1",
      }),
    ).toBe(
      "/fr/chat?conversationId=conversation-1&agentId=agent-fast",
    );
  });

  it("keeps the selected assistant for temporary conversations", () => {
    expect(
      createChatHref({
        agentId: "agent-code",
        temporaryTtlMinutes: 60,
      }),
    ).toBe("/chat?agentId=agent-code&temporary=true&ttl=60");
  });
});
