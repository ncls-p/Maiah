import { describe, expect, it } from "vitest";

import { shouldUseMessageScrollAnchor } from "@/components/chat/chat-scroll";
import type { ChatMessage } from "@/components/chat/chat-types";

function message(role: ChatMessage["role"]): ChatMessage {
  return { id: `${role}-1`, role, parts: [] };
}

describe("shouldUseMessageScrollAnchor", () => {
  it("anchors the user turn while a response is streaming", () => {
    expect(shouldUseMessageScrollAnchor(message("user"))).toBe(true);
  });

  it("keeps user messages available as stable navigation anchors", () => {
    expect(shouldUseMessageScrollAnchor(message("user"))).toBe(true);
  });

  it("never anchors assistant messages", () => {
    expect(shouldUseMessageScrollAnchor(message("assistant"))).toBe(false);
  });
});
