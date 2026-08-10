import {
  getToolStatus,
  groupWorkPhaseParts,
  parseToolPart,
  resolveToolDisplayStatus,
  resolveWorkPhaseOutcome,
  workPhaseHasPendingWork,
  type ChatMessage,
} from "@/components/chat/chat-types";
import { describe, expect, it } from "vitest";

describe("chat message parts", () => {
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

  it("keeps a completed child tool successful when the parent message fails", () => {
    const parsed = parseToolPart(
      JSON.stringify({
        output: { result: "Useful specialist research" },
        agentContext: {
          agentId: "child",
          agentName: "Specialist",
          runId: "child-run",
          depth: 1,
          status: "success",
        },
      }),
    );

    expect(resolveToolDisplayStatus(parsed, "failed")).toBe("completed");
  });

  it("marks a failed assistant message as interrupted without poisoning successful tools", () => {
    const parts = [
      {
        type: "tool-call",
        content: JSON.stringify({
          output: { result: "Returned result" },
          agentContext: {
            agentId: "child",
            agentName: "Specialist",
            runId: "child-run",
            depth: 1,
            status: "success",
          },
        }),
      },
    ];

    expect(
      resolveWorkPhaseOutcome({
        parts,
        messageStatus: "failed",
        hasVisibleResponseAfter: true,
      }),
    ).toBe("interrupted");
    expect(
      resolveToolDisplayStatus(parseToolPart(parts[0].content), "failed"),
    ).toBe("completed");
  });

  it("reports recovered tool failures as completed with warnings", () => {
    const parts: ChatMessage["parts"] = [
      {
        type: "tool-call",
        content: JSON.stringify({
          toolCallId: "failed-call",
          toolName: "execute_dql",
          output: { ok: false, error: "Invalid DQL query" },
        }),
      },
      {
        type: "tool-call",
        content: JSON.stringify({
          toolCallId: "retry-call",
          toolName: "execute_dql",
          output: { ok: true, result: [{ id: "problem-1" }] },
        }),
      },
    ];

    expect(
      resolveWorkPhaseOutcome({
        parts,
        messageStatus: "completed",
        hasVisibleResponseAfter: false,
      }),
    ).toBe("completed-with-issues");
  });

  it("keeps an unrecovered failed tool sequence interrupted", () => {
    const parts: ChatMessage["parts"] = [
      {
        type: "tool-call",
        content: JSON.stringify({
          toolName: "create_or_update_file",
          output: { ok: false, error: "SHA mismatch" },
        }),
      },
    ];

    expect(
      resolveWorkPhaseOutcome({
        parts,
        messageStatus: "completed",
        hasVisibleResponseAfter: false,
      }),
    ).toBe("interrupted");
    expect(
      resolveWorkPhaseOutcome({
        parts,
        messageStatus: "streaming",
        hasVisibleResponseAfter: false,
      }),
    ).toBe("pending");
  });
});
