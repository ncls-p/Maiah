import { describe,expect,it } from "vitest";
import { abortChatStream,completeChatStream,createChatUIMessageStreamResponse,hasActiveChatStream,publishChatStreamEvent,registerChatStreamAbortController,subscribeToChatStream } from "./stream-bus.test.publish-chat-stream-event";

describe("stream-bus", () => {
  describe("hasActiveChatStream", () => {
    it("returns false for unknown message", () => {
      expect(hasActiveChatStream(crypto.randomUUID())).toBe(false);
    });

    it("returns true after first publish", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text" });
      expect(hasActiveChatStream(id)).toBe(true);
    });

    it("returns false after stream is completed", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text" });
      completeChatStream(id);
      expect(hasActiveChatStream(id)).toBe(false);
    });
  });

  describe("subscribeToChatStream", () => {
    it("replays past events to new subscriber", () => {
      const id = crypto.randomUUID();
      const events = [
        { type: "text", content: "a" },
        { type: "text", content: "b" },
      ];
      for (const e of events) publishChatStreamEvent(id, e);

      const received: Record<string, unknown>[] = [];
      const closed = { value: false };
      subscribeToChatStream(id, {
        enqueue: (e) => received.push(e),
        close: () => {
          closed.value = true;
        },
      });

      expect(received).toEqual(events);
      expect(closed.value).toBe(false);
    });

    it("skips replay when replay=false", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text", content: "old" });

      const received: Record<string, unknown>[] = [];
      subscribeToChatStream(id, { enqueue: (e) => received.push(e), close: () => {} }, { replay: false });

      expect(received).toHaveLength(0);
    });

    it("immediately closes subscriber when stream is already done", () => {
      const id = crypto.randomUUID();
      completeChatStream(id);

      const closed = { value: false };
      subscribeToChatStream(id, {
        enqueue: () => {},
        close: () => {
          closed.value = true;
        },
      });

      expect(closed.value).toBe(true);
    });

    it("delivers new events to active subscriber", () => {
      const id = crypto.randomUUID();
      const received: Record<string, unknown>[] = [];
      subscribeToChatStream(id, {
        enqueue: (e) => received.push(e),
        close: () => {},
      });

      publishChatStreamEvent(id, { type: "delta", token: "hi" });

      expect(received).toEqual([{ type: "delta", token: "hi" }]);
    });

    it("closes subscriber when stream completes", () => {
      const id = crypto.randomUUID();
      const closed = { value: false };
      subscribeToChatStream(id, {
        enqueue: () => {},
        close: () => {
          closed.value = true;
        },
      });

      completeChatStream(id);

      expect(closed.value).toBe(true);
    });

    it("unsubscribe stops delivering events", () => {
      const id = crypto.randomUUID();
      const received: Record<string, unknown>[] = [];
      const unsubscribe = subscribeToChatStream(id, {
        enqueue: (e) => received.push(e),
        close: () => {},
      });

      unsubscribe();
      publishChatStreamEvent(id, { type: "delta" });

      expect(received).toHaveLength(0);
    });
  });

  describe("abortChatStream", () => {
    it("returns false for unknown message", () => {
      expect(abortChatStream(crypto.randomUUID())).toBe(false);
    });

    it("returns false for already completed stream", () => {
      const id = crypto.randomUUID();
      completeChatStream(id);
      expect(abortChatStream(id)).toBe(false);
    });

    it("returns true and marks stream done", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text" });

      expect(abortChatStream(id)).toBe(true);
      expect(hasActiveChatStream(id)).toBe(false);
    });

    it("calls abort on registered controller", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text" });

      const controller = new AbortController();
      registerChatStreamAbortController(id, controller);

      abortChatStream(id);

      expect(controller.signal.aborted).toBe(true);
    });

    it("starts a fresh stream when a completed message is continued", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text", delta: "old" });
      completeChatStream(id);

      registerChatStreamAbortController(id, new AbortController());
      publishChatStreamEvent(id, { type: "text", delta: "continued" });

      const received: Record<string, unknown>[] = [];
      subscribeToChatStream(id, {
        enqueue: (event) => received.push(event),
        close: () => {},
      });

      expect(received).toEqual([{ type: "text", delta: "continued" }]);
      expect(hasActiveChatStream(id)).toBe(true);
    });
  });

  describe("AI SDK UI stream response", () => {
    async function readResponseText(response: Response) {
      const reader = response.body?.getReader();
      expect(reader).toBeDefined();
      const decoder = new TextDecoder();
      let text = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    }

    it("maps bus events to AI SDK UIMessage stream chunks", async () => {
      const id = crypto.randomUUID();
      const response = createChatUIMessageStreamResponse(id, {
        "X-Conversation-Id": "conversation-id",
        "X-Message-Id": id,
        "X-User-Message-Id": "user-message-id",
      });

      publishChatStreamEvent(id, { type: "text", delta: "Hello" });
      publishChatStreamEvent(id, {
        type: "tool_call",
        toolCallId: "call-1",
        toolName: "lookup",
        input: { q: "x" },
        agentContext: {
          agentId: "agent-1",
          agentName: "Research specialist",
          runId: "run-1",
          depth: 1,
          status: "running",
        },
      });
      publishChatStreamEvent(id, {
        type: "tool_result",
        toolCallId: "call-1",
        toolName: "lookup",
        output: { ok: true },
        agentContext: {
          agentId: "agent-1",
          agentName: "Research specialist",
          runId: "run-1",
          depth: 1,
          status: "success",
        },
      });
      publishChatStreamEvent(id, { type: "done" });
      completeChatStream(id);

      const text = await readResponseText(response);
      expect(text).toContain('"type":"start"');
      expect(text).toContain('"conversationId":"conversation-id"');
      expect(text).toContain('"type":"text-delta"');
      expect(text).toContain('"type":"tool-input-available"');
      expect(text).toContain('"type":"tool-output-available"');
      expect(text).toContain('"type":"data-agent-tool-context"');
      expect(text).toContain('"agentName":"Research specialist"');
      expect(text).toContain('"type":"finish"');
    });
  });

  describe("publishChatStreamEvent", () => {
    it("stores event in run history", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text", content: "hello" });
      publishChatStreamEvent(id, { type: "done" });

      const received: Record<string, unknown>[] = [];
      subscribeToChatStream(id, { enqueue: (e) => received.push(e), close: () => {} }, { replay: true });

      expect(received).toHaveLength(2);
    });

    it("redacts tool payloads before replay or delivery", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, {
        type: "tool_call",
        toolCallId: "call-1",
        toolName: "webhook",
        input: { apiKey: "hidden", maxOutputTokens: 128 },
      });

      const received: Record<string, unknown>[] = [];
      subscribeToChatStream(id, { enqueue: (event) => received.push(event), close: () => {} }, { replay: true });

      expect(received).toEqual([
        expect.objectContaining({
          input: { apiKey: "[REDACTED]", maxOutputTokens: 128 },
        }),
      ]);
    });
  });
});
