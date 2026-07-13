import { describe, expect, it } from "vitest";
import {
  appendMessagePart,
  completeReasoningParts,
  getToolStatus,
  groupWorkPhaseParts,
  parseToolPart,
  renderablePartsFromMessage,
  startReasoningPart,
  workPhaseHasPendingWork,
  type ChatMessage,
} from "@/components/chat/chat-types";

describe("chat message parts", () => {
  it("keeps reasoning blocks split across tool calls", () => {
    let parts: ChatMessage["parts"] = [];

    parts = appendMessagePart(parts, "reasoning", "before tool");
    parts = [
      ...parts,
      {
        type: "tool-call",
        content: JSON.stringify({ toolName: "web_search" }),
      },
    ];
    parts = appendMessagePart(parts, "reasoning", "after tool");

    expect(parts).toEqual([
      { type: "reasoning", content: "before tool", state: "streaming" },
      {
        type: "tool-call",
        content: JSON.stringify({ toolName: "web_search" }),
      },
      { type: "reasoning", content: "after tool", state: "streaming" },
    ]);
  });

  it("still merges consecutive deltas of the same type", () => {
    let parts: ChatMessage["parts"] = [];

    parts = appendMessagePart(parts, "reasoning", "first ");
    parts = appendMessagePart(parts, "reasoning", "second");

    expect(parts).toEqual([
      { type: "reasoning", content: "first second", state: "streaming" },
    ]);
  });

  it("tracks the reasoning lifecycle independently from the message", () => {
    let parts: ChatMessage["parts"] = [];

    parts = startReasoningPart(parts);
    parts = appendMessagePart(parts, "reasoning", "thinking");
    expect(parts).toEqual([
      { type: "reasoning", content: "thinking", state: "streaming" },
    ]);

    parts = completeReasoningParts(parts);
    expect(parts).toEqual([
      { type: "reasoning", content: "thinking", state: "done" },
    ]);
  });

  it("returns renderable parts in message order", () => {
    const message: ChatMessage = {
      id: "message",
      role: "assistant",
      parts: [
        { type: "reasoning", content: "thinking" },
        { type: "tool-call", content: "{}" },
        { type: "tool-result", content: "{}" },
        { type: "text", content: "answer" },
        { type: "citations", content: "[]" },
      ],
    };

    expect(
      renderablePartsFromMessage(message).map((part) => part.type),
    ).toEqual(["reasoning", "tool-call", "tool-result", "text"]);
  });

  it("merges matching tool calls and results into one renderable card", () => {
    const completedAgentContext = {
      agentId: "agent-1",
      agentName: "Research specialist",
      runId: "run-1",
      depth: 1,
      status: "success",
    };
    const message: ChatMessage = {
      id: "message",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          content: JSON.stringify({
            toolCallId: "call-1",
            toolName: "web_search",
            input: { query: "next" },
            agentContext: {
              ...completedAgentContext,
              status: "running",
            },
          }),
        },
        {
          type: "tool-result",
          content: JSON.stringify({
            toolCallId: "call-1",
            toolName: "web_search",
            output: { results: [] },
            agentContext: completedAgentContext,
          }),
        },
      ],
    };

    const parts = renderablePartsFromMessage(message);

    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe("tool-call");
    expect(parseToolPart(parts[0].content)).toMatchObject({
      toolCallId: "call-1",
      toolName: "web_search",
      input: { query: "next" },
      output: { results: [] },
      agentContext: completedAgentContext,
    });
  });

  it("keeps unmatched tool results visible", () => {
    const message: ChatMessage = {
      id: "message",
      role: "assistant",
      parts: [
        {
          type: "tool-result",
          content: JSON.stringify({
            toolCallId: "call-1",
            toolName: "web_search",
            output: "done",
          }),
        },
      ],
    };

    expect(
      renderablePartsFromMessage(message).map((part) => part.type),
    ).toEqual(["tool-result"]);
  });

  it("groups consecutive reasoning and tool work before meaningful text", () => {
    const groups = groupWorkPhaseParts([
      { type: "reasoning", content: "plan" },
      { type: "tool-call", content: "{}" },
      { type: "reasoning", content: "review" },
      { type: "text", content: "Final answer" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      type: "work-phase",
      hasVisibleResponseAfter: true,
      parts: [
        { partIndex: 0, part: { type: "reasoning" } },
        { partIndex: 1, part: { type: "tool-call" } },
        { partIndex: 2, part: { type: "reasoning" } },
      ],
    });
    expect(groups[1]).toMatchObject({
      type: "part",
      partIndex: 3,
      part: { type: "text" },
    });
  });

  it("does not finish a work phase for blank streamed text", () => {
    const groups = groupWorkPhaseParts([
      { type: "reasoning", content: "plan" },
      { type: "tool-call", content: "{}" },
      { type: "text", content: "   " },
    ]);

    expect(groups[0]).toMatchObject({
      type: "work-phase",
      hasVisibleResponseAfter: false,
    });
  });

  it("leaves isolated reasoning and tool cards unwrapped", () => {
    const groups = groupWorkPhaseParts([
      { type: "reasoning", content: "plan" },
      { type: "text", content: "First answer" },
      { type: "tool-call", content: "{}" },
      { type: "text", content: "Second answer" },
    ]);

    expect(groups.map((group) => group.type)).toEqual([
      "part",
      "part",
      "part",
      "part",
    ]);
  });

  it("keeps standalone visual outputs outside work phases", () => {
    const parts: ChatMessage["parts"] = [
      { type: "reasoning", content: "plan" },
      { type: "tool-call", content: '{"toolName":"web_search"}' },
      {
        type: "tool-call",
        content: '{"toolName":"render_html_artifact"}',
      },
    ];
    const groups = groupWorkPhaseParts(parts, {
      isStandalonePart: (part) => part.content.includes("render_html_artifact"),
    });

    expect(groups.map((group) => group.type)).toEqual(["work-phase", "part"]);
    expect(groups[1]).toMatchObject({
      type: "part",
      partIndex: 2,
      part: { type: "tool-call" },
    });
    expect(groups[0]).toMatchObject({
      type: "work-phase",
      hasVisibleResponseAfter: true,
    });
  });

  it("does not keep unresolved tool cards active after the message ends", () => {
    const parts = [
      { type: "reasoning", content: "plan", state: "done" as const },
      {
        type: "tool-call",
        content: JSON.stringify({
          toolCallId: "call-1",
          toolName: "web_search",
        }),
      },
    ];

    expect(workPhaseHasPendingWork(parts, "streaming")).toBe(true);
    expect(workPhaseHasPendingWork(parts, "completed")).toBe(false);
  });

  it("marks invalid and failed tool calls as errors", () => {
    expect(
      getToolStatus(
        parseToolPart(
          JSON.stringify({
            invalid: true,
            error: { name: "AI_NoSuchToolError" },
          }),
        ),
      ),
    ).toBe("error");
    expect(
      getToolStatus(
        parseToolPart(
          JSON.stringify({
            output: { ok: false, error: "Tool execution failed" },
          }),
        ),
      ),
    ).toBe("error");
  });
});
