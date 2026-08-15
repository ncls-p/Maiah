import { describe, expect, it } from "vitest";

import {
  canAdoptRouteConversation,
  createChatHref,
} from "@/lib/chat-navigation";

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
    ).toBe("/fr/chat?conversationId=conversation-1&agentId=agent-fast");
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

describe("canAdoptRouteConversation", () => {
  it("does not revert to the previous version while a regeneration is streaming", () => {
    expect(
      canAdoptRouteConversation({
        routeConversationId: "version-1",
        activeConversationId: "version-2",
        sending: true,
      }),
    ).toBe(false);
  });

  it("adopts a route conversation once the stream is idle", () => {
    expect(
      canAdoptRouteConversation({
        routeConversationId: "version-1",
        activeConversationId: "version-2",
        sending: false,
      }),
    ).toBe(true);
  });

  it("ignores the current conversation and an empty route", () => {
    expect(
      canAdoptRouteConversation({
        routeConversationId: "version-2",
        activeConversationId: "version-2",
        sending: false,
      }),
    ).toBe(false);
    expect(
      canAdoptRouteConversation({
        routeConversationId: null,
        activeConversationId: "version-2",
        sending: false,
      }),
    ).toBe(false);
  });
});
