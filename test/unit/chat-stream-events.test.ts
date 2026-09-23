import { describe, expect, it, vi } from "vitest";

import { toolPartHasStandaloneRendering } from "@/components/chat/chat-message-rendering-utils";
import {
  groupWorkPhaseParts,
  renderablePartsFromMessage,
  type ChatMessage,
  type ChatStreamEvent,
} from "@/components/chat/chat-types";
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

describe("chat stream sandbox deliverables lifecycle", () => {
  const sandboxOutput = {
    kind: "code_sandbox_result",
    ok: true,
    language: "python",
    exitCode: 0,
    timedOut: false,
    durationMs: 12,
    stdout: "",
    stderr: "",
    files: [
      {
        path: "report.txt",
        size: 6,
        mimeType: "text/plain",
        downloadUrl: "/attachments/report.txt",
      },
    ],
  };

  function layout(message: ChatMessage) {
    const parts = renderablePartsFromMessage(message);
    return groupWorkPhaseParts(parts, {
      isStandalonePart: (part) =>
        toolPartHasStandaloneRendering(part, {
          messageStreaming: message.status === "streaming",
        }),
    }).map((group) =>
      group.type === "part"
        ? `${group.part.type}:${toolPartHasStandaloneRendering(group.part, {
            messageStreaming: message.status === "streaming",
          })}`
        : `work-phase:${group.parts.length}`,
    );
  }

  it("keeps one standalone sandbox card through streaming, finalization and reload", () => {
    let assistant: ChatMessage = {
      id: "assistant-message",
      role: "assistant",
      status: "streaming",
      parts: [
        {
          type: "tool-call",
          content: JSON.stringify({
            toolCallId: "search-call",
            toolName: "web_search",
            input: { query: "figures" },
            output: { sourceCount: 2 },
          }),
        },
      ],
    };
    const handlers = {
      updateAssistant: (updater: (message: ChatMessage) => ChatMessage) => {
        assistant = updater(assistant);
      },
      addPendingApproval: vi.fn(),
      clearPendingApprovals: vi.fn(),
      setCitations: vi.fn(),
    };
    const events: ChatStreamEvent[] = [
      {
        type: "tool_input_start",
        toolCallId: "sandbox-call",
        toolName: "run_code_sandbox",
      },
      {
        type: "tool_input_snapshot",
        toolCallId: "sandbox-call",
        toolName: "run_code_sandbox",
        inputText: '{"language":"python","code":"print(',
      },
      { type: "tool_input_end", toolCallId: "sandbox-call" },
      {
        type: "tool_call",
        toolCallId: "sandbox-call",
        toolName: "run_code_sandbox",
        input: { language: "python", code: "print(42)" },
      },
      {
        type: "tool_result",
        toolCallId: "sandbox-call",
        toolName: "run_code_sandbox",
        output: sandboxOutput,
      },
    ];

    const expected = ["tool-call:false", "tool-call:true"];
    for (const event of events) {
      applyStreamEvent(event, handlers);
      // The sandbox card never joins the trace and is never duplicated.
      expect(layout(assistant)).toEqual(expected);
    }
    applyStreamEvent({ type: "done" }, handlers);
    expect(layout(assistant)).toEqual(expected);

    // Reload: persisted rows store the call and the result as separate parts.
    const reloaded: ChatMessage = {
      id: "assistant-message",
      role: "assistant",
      status: "completed",
      parts: [
        assistant.parts[0],
        {
          type: "tool-call",
          content: JSON.stringify({
            toolCallId: "sandbox-call",
            toolName: "run_code_sandbox",
            input: { language: "python", code: "print(42)" },
          }),
        },
        {
          type: "tool-result",
          content: JSON.stringify({
            toolCallId: "sandbox-call",
            toolName: "run_code_sandbox",
            output: sandboxOutput,
          }),
        },
      ],
    };
    const reloadedLayout = layout(reloaded);
    expect(reloadedLayout).toHaveLength(2);
    expect(reloadedLayout[1]).toMatch(/:true$/);
  });
});
