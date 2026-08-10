import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/components/chat/chat-types";
import { applyStreamEvent } from "@/hooks/use-chat-stream-events";

describe("chat stream reasoning lifecycle", () => {
  it("completes reasoning before the rest of the assistant message", () => {
    let assistant: ChatMessage = {
      id: "assistant-message",
      role: "assistant",
      status: "streaming",
      parts: [],
    };
    const handlers = {
      updateAssistant: (updater: (message: ChatMessage) => ChatMessage) => {
        assistant = updater(assistant);
      },
      addPendingApproval: vi.fn(),
      clearPendingApprovals: vi.fn(),
      setCitations: vi.fn(),
    };

    applyStreamEvent({ type: "reasoning_start" }, handlers);
    applyStreamEvent(
      { type: "reasoning", delta: "Inspecting the request" },
      handlers,
    );

    expect(assistant.parts).toEqual([
      {
        type: "reasoning",
        content: "Inspecting the request",
        state: "streaming",
      },
    ]);

    applyStreamEvent({ type: "reasoning_end" }, handlers);
    applyStreamEvent({ type: "text", delta: "Here is the answer." }, handlers);

    expect(assistant.status).toBe("streaming");
    expect(assistant.parts).toEqual([
      {
        type: "reasoning",
        content: "Inspecting the request",
        state: "done",
      },
      { type: "text", content: "Here is the answer." },
    ]);
  });
});

describe("chat stream tool input lifecycle", () => {
  it("replaces progressive snapshots instead of concatenating them", () => {
    let assistant: ChatMessage = {
      id: "assistant-message",
      role: "assistant",
      status: "streaming",
      parts: [],
    };
    const handlers = {
      updateAssistant: (updater: (message: ChatMessage) => ChatMessage) => {
        assistant = updater(assistant);
      },
      addPendingApproval: vi.fn(),
      clearPendingApprovals: vi.fn(),
      setCitations: vi.fn(),
    };

    applyStreamEvent(
      {
        type: "tool_input_start",
        toolCallId: "call-1",
        toolName: "web_search",
      },
      handlers,
    );
    applyStreamEvent(
      {
        type: "tool_input_snapshot",
        toolCallId: "call-1",
        toolName: "web_search",
        inputText: '{"query":"mai"}',
      },
      handlers,
    );
    applyStreamEvent(
      {
        type: "tool_input_snapshot",
        toolCallId: "call-1",
        toolName: "web_search",
        inputText: '{"query":"maiah"}',
      },
      handlers,
    );

    expect(JSON.parse(assistant.parts[0].content)).toMatchObject({
      toolCallId: "call-1",
      toolName: "web_search",
      inputText: '{"query":"maiah"}',
      streamingInput: true,
    });
  });
});
