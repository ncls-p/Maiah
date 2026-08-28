import { describe, expect, it } from "vitest";
import {
  completeChatStream,
  createChatUIMessageStreamResponse,
  publishChatStreamEvent,
  subscribeToChatStream,
} from "./stream-bus.test.publish-chat-stream-event";

describe("stream-bus", () => {
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
      subscribeToChatStream(
        id,
        { enqueue: (e) => received.push(e), close: () => {} },
        { replay: true },
      );

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
      subscribeToChatStream(
        id,
        { enqueue: (event) => received.push(event), close: () => {} },
        { replay: true },
      );

      expect(received).toEqual([
        expect.objectContaining({
          input: { apiKey: "[REDACTED]", maxOutputTokens: 128 },
        }),
      ]);
    });
  });
});

