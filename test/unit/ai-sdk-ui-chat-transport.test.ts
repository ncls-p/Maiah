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
});
