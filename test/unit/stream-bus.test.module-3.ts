import { describe,expect,it } from "vitest";
import { completeChatStream,createChatUIMessageStreamResponse,publishChatStreamEvent } from "./stream-bus.test.publish-chat-stream-event";

describe("additional stream response event mappings", () => {
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

  it("creates a raw SSE response with replay and custom headers", async () => {
    const { createChatStreamResponse } = await import("@/modules/chat/stream-bus");
    const id = crypto.randomUUID();
    publishChatStreamEvent(id, { type: "text", delta: "old" });
    const response = createChatStreamResponse(id, { "X-Test": "yes" });
    publishChatStreamEvent(id, { type: "done" });
    completeChatStream(id);

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("X-Test")).toBe("yes");
    const text = await readResponseText(response);
    expect(text).toContain('data: {"type":"text","delta":"old"}');
    expect(text).toContain('data: {"type":"done"}');
  });

  it("maps reasoning, streaming tool input, denied outputs, approvals, citations, files, suggestions, titles, and errors", async () => {
    const id = crypto.randomUUID();
    const response = createChatUIMessageStreamResponse(id, {
      "X-Conversation-Id": "conversation-id",
      "X-Message-Id": id,
    });

    publishChatStreamEvent(id, { type: "reasoning", delta: "thinking" });
    publishChatStreamEvent(id, {
      type: "tool_input_start",
      toolCallId: "call-1",
      toolName: "search",
    });
    publishChatStreamEvent(id, {
      type: "tool_input_delta",
      toolCallId: "call-1",
      delta: '{"q"',
    });
    publishChatStreamEvent(id, {
      type: "tool_input_snapshot",
      toolCallId: "call-1",
      toolName: "search",
      inputText: JSON.stringify({ query: "Maiah", apiKey: "hidden" }),
    });
    publishChatStreamEvent(id, {
      type: "tool_result",
      toolCallId: "call-1",
      output: { denied: true },
    });
    publishChatStreamEvent(id, {
      type: "tool_approval_required",
      invocationId: "inv-1",
      toolName: "write",
      input: { path: "x" },
    });
    publishChatStreamEvent(id, {
      type: "citations",
      citations: [{ chunkId: "chunk-1", documentTitle: "Doc" }, { other: true }],
    });
    publishChatStreamEvent(id, {
      type: "file",
      artifact: { projectId: "project-1", title: "App" },
    });
    publishChatStreamEvent(id, { type: "suggestions", suggestions: ["Next"] });
    publishChatStreamEvent(id, {
      type: "conversation_title",
      title: "New title",
    });
    publishChatStreamEvent(id, { type: "error", error: "boom" });
    completeChatStream(id);

    const text = await readResponseText(response);
    expect(text).toContain('"type":"reasoning-start"');
    expect(text).toContain('"type":"reasoning-delta"');
    expect(text).toContain('"type":"reasoning-end"');
    expect(text.indexOf('"type":"reasoning-end"')).toBeLessThan(text.indexOf('"type":"tool-input-start"'));
    expect(text).toContain('"type":"tool-input-start"');
    expect(text).not.toContain('"type":"tool-input-delta"');
    expect(text).not.toContain('{"q"');
    expect(text).toContain('"type":"data-tool-input-progress"');
    expect(text).toContain("Maiah");
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("hidden");
    expect(text).toContain('"type":"tool-output-denied"');
    expect(text).toContain('"type":"data-tool-approval"');
    expect(text).toContain('"type":"data-citations"');
    expect(text).toContain('"type":"source-document"');
    expect(text).toContain('"type":"data-code-workspace-artifact"');
    expect(text).toContain('"type":"data-suggestions"');
    expect(text).toContain('"type":"data-conversation-title"');
    expect(text).toContain('"type":"error"');
    expect(text).toContain("boom");
  });
});
