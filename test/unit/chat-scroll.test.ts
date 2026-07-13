import { describe, expect, it } from "vitest";

import {
  cancelsChatStreamFollow,
  getChatStreamFollowKey,
  isChatViewportAtEnd,
  shouldUseMessageScrollAnchor,
} from "@/components/chat/chat-scroll";
import type { ChatMessage } from "@/components/chat/chat-types";

function message(role: ChatMessage["role"]): ChatMessage {
  return { id: `${role}-1`, role, parts: [] };
}

describe("shouldUseMessageScrollAnchor", () => {
  it("does not create user scroll anchors while a response is streaming", () => {
    expect(
      shouldUseMessageScrollAnchor({
        message: message("user"),
        sending: true,
      }),
    ).toBe(false);
  });

  it("does not use message anchors while the chat is idle", () => {
    expect(
      shouldUseMessageScrollAnchor({
        message: message("user"),
        sending: false,
      }),
    ).toBe(false);
  });

  it("never anchors assistant messages", () => {
    expect(
      shouldUseMessageScrollAnchor({
        message: message("assistant"),
        sending: false,
      }),
    ).toBe(false);
  });
});

describe("stream following", () => {
  it("treats the viewport as anchored within the end threshold", () => {
    expect(
      isChatViewportAtEnd({
        scrollTop: 968,
        scrollHeight: 2000,
        clientHeight: 1000,
      }),
    ).toBe(true);
    expect(
      isChatViewportAtEnd({
        scrollTop: 900,
        scrollHeight: 2000,
        clientHeight: 1000,
      }),
    ).toBe(false);
  });

  it("changes the follow key for streamed reasoning and tool input", () => {
    const initial: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        status: "streaming",
        parts: [{ type: "reasoning", content: "Plan" }],
      },
    ];
    const reasoningDelta: ChatMessage[] = [
      {
        ...initial[0],
        parts: [{ type: "reasoning", content: "Plan and verify" }],
      },
    ];
    const toolDelta: ChatMessage[] = [
      {
        ...reasoningDelta[0],
        parts: [
          ...reasoningDelta[0].parts,
          {
            type: "tool-call",
            state: "streaming" as const,
            content: '{"inputText":"{\\"query\\":\\"mai"}',
          },
        ],
      },
    ];
    const nextToolDelta: ChatMessage[] = [
      {
        ...toolDelta[0],
        parts: [
          toolDelta[0].parts[0],
          {
            ...toolDelta[0].parts[1],
            content: '{"inputText":"{\\"query\\":\\"maiah\\"}"}',
          },
        ],
      },
    ];

    expect(getChatStreamFollowKey(reasoningDelta)).not.toBe(
      getChatStreamFollowKey(initial),
    );
    expect(getChatStreamFollowKey(toolDelta)).not.toBe(
      getChatStreamFollowKey(reasoningDelta),
    );
    expect(getChatStreamFollowKey(nextToolDelta)).not.toBe(
      getChatStreamFollowKey(toolDelta),
    );
  });

  it("only cancels following for interactions that move toward older content", () => {
    expect(cancelsChatStreamFollow({ key: "ArrowUp" })).toBe(true);
    expect(cancelsChatStreamFollow({ key: "PageUp" })).toBe(true);
    expect(cancelsChatStreamFollow({ key: "Home" })).toBe(true);
    expect(cancelsChatStreamFollow({ key: " ", shiftKey: true })).toBe(true);
    expect(cancelsChatStreamFollow({ key: "ArrowDown" })).toBe(false);
    expect(cancelsChatStreamFollow({ key: "End" })).toBe(false);
    expect(cancelsChatStreamFollow({ key: " " })).toBe(false);
  });
});
