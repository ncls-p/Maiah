import { afterEach, describe, expect, it, vi } from "vitest";

import { streamAiSdkUIChat } from "@/hooks/ai-sdk-ui-chat-transport";
import {
  completeChatStream,
  createChatUIMessageStreamResponse,
  publishChatStreamEvent,
} from "@/modules/chat/stream-bus";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI SDK UI chat transport", () => {
  it("ends reasoning while the assistant response keeps streaming", async () => {
    const messageId = crypto.randomUUID();

    publishChatStreamEvent(messageId, { type: "reasoning_start" });
    publishChatStreamEvent(messageId, {
      type: "reasoning",
      delta: "thinking",
    });
    publishChatStreamEvent(messageId, { type: "reasoning_end" });
    publishChatStreamEvent(messageId, { type: "text", delta: "answer" });
    publishChatStreamEvent(messageId, { type: "done" });
    completeChatStream(messageId);

    const response = createChatUIMessageStreamResponse(messageId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const events: Array<Record<string, unknown>> = [];

    await streamAiSdkUIChat({
      api: "/api/chat",
      chatId: "chat-1",
      content: "Question",
      localUserMessageId: "user-message-1",
      body: {},
      abortSignal: new AbortController().signal,
      onStart: vi.fn(),
      onEvent: (event) => events.push(event),
    });

    expect(events.map((event) => event.type)).toEqual([
      "reasoning_start",
      "reasoning",
      "reasoning_end",
      "text",
      "done",
    ]);
  });

  it("preserves server-owned agent attribution across tool lifecycle chunks", async () => {
    const messageId = crypto.randomUUID();
    const runningContext = {
      agentId: "agent-1",
      agentName: "Research specialist",
      runId: "run-1",
      depth: 1,
      status: "running",
    };
    const completedContext = {
      ...runningContext,
      status: "success",
      durationMs: 12,
    };

    publishChatStreamEvent(messageId, {
      type: "tool_call",
      toolCallId: "call-1",
      toolName: "web_search",
      input: { query: "cloud" },
      agentContext: runningContext,
    });
    publishChatStreamEvent(messageId, {
      type: "tool_result",
      toolCallId: "call-1",
      toolName: "web_search",
      output: { count: 3 },
      agentContext: completedContext,
    });
    publishChatStreamEvent(messageId, { type: "done" });
    completeChatStream(messageId);

    const response = createChatUIMessageStreamResponse(messageId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const events: Array<Record<string, unknown>> = [];

    await streamAiSdkUIChat({
      api: "/api/chat",
      chatId: "chat-1",
      content: "Research cloud",
      localUserMessageId: "user-message-1",
      body: {},
      abortSignal: new AbortController().signal,
      onStart: vi.fn(),
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_call",
        toolCallId: "call-1",
        agentContext: runningContext,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        toolCallId: "call-1",
        agentContext: completedContext,
      }),
    );
  });

  it("delivers redacted progressive tool input snapshots", async () => {
    const messageId = crypto.randomUUID();

    publishChatStreamEvent(messageId, {
      type: "tool_input_start",
      toolCallId: "call-1",
      toolName: "web_search",
    });
    publishChatStreamEvent(messageId, {
      type: "tool_input_snapshot",
      toolCallId: "call-1",
      toolName: "web_search",
      inputText: JSON.stringify({ query: "Maiah" }),
    });
    publishChatStreamEvent(messageId, { type: "done" });
    completeChatStream(messageId);

    const response = createChatUIMessageStreamResponse(messageId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const events: Array<Record<string, unknown>> = [];

    await streamAiSdkUIChat({
      api: "/api/chat",
      chatId: "chat-1",
      content: "Search Maiah",
      localUserMessageId: "user-message-1",
      body: {},
      abortSignal: new AbortController().signal,
      onStart: vi.fn(),
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual({
      type: "tool_input_snapshot",
      toolCallId: "call-1",
      toolName: "web_search",
      inputText: JSON.stringify({ query: "Maiah" }, null, 2),
    });
  });
});
