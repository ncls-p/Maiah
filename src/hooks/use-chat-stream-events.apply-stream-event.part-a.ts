"use client";
import {
  appendMessagePart,
  completeReasoningParts,
  startReasoningPart,
  type ChatCitation,
  type ChatMessage,
  type ChatStreamEvent,
  type PendingToolApproval,
} from "@/components/chat/chat-types";

export type ApplyStreamEventHandlers = {
  updateAssistant: (updater: (message: ChatMessage) => ChatMessage) => void;
  addPendingApproval: (approval: PendingToolApproval) => void;
  clearPendingApprovals: () => void;
  setCitations: (citations: ChatCitation[]) => void;
  onConversationTitle?: (title: string) => void;
  onDone?: () => void;
};

export type ToolStreamEventType =
  | "tool_approval_required"
  | "tool_input_start"
  | "tool_input_delta"
  | "tool_input_snapshot"
  | "tool_input_end"
  | "tool_call"
  | "tool_result";

export type ToolStreamEvent = Extract<
  ChatStreamEvent,
  { type: ToolStreamEventType }
>;

export type MessageStreamEvent = Exclude<
  ChatStreamEvent,
  ToolStreamEvent | { type: "error" }
>;

export function isToolStreamEvent(
  parsed: ChatStreamEvent,
): parsed is ToolStreamEvent {
  return (
    parsed.type === "tool_approval_required" ||
    parsed.type === "tool_input_start" ||
    parsed.type === "tool_input_delta" ||
    parsed.type === "tool_input_snapshot" ||
    parsed.type === "tool_input_end" ||
    parsed.type === "tool_call" ||
    parsed.type === "tool_result"
  );
}

export function applyStreamEventMessage(
  parsed: MessageStreamEvent,
  handlers: ApplyStreamEventHandlers,
) {
  if (parsed.type === "done") {
    handlers.updateAssistant((message) => ({
      ...message,
      status: "completed",
      ...(parsed.metrics ? { metrics: parsed.metrics } : {}),
      parts: completeReasoningParts(message.parts),
    }));
    handlers.clearPendingApprovals();
    handlers.onDone?.();
    return;
  }
  if (parsed.type === "reasoning_start") {
    handlers.updateAssistant((message) => ({
      ...message,
      parts: startReasoningPart(message.parts),
    }));
    return;
  }
  if (parsed.type === "reasoning_end") {
    handlers.updateAssistant((message) => ({
      ...message,
      parts: completeReasoningParts(message.parts),
    }));
    return;
  }
  if (parsed.type === "conversation_title") {
    handlers.onConversationTitle?.(parsed.title);
    return;
  }
  if (parsed.type === "file") {
    handlers.updateAssistant((message) => ({
      ...message,
      parts: [
        ...message.parts,
        { type: "file", content: JSON.stringify(parsed.artifact) },
      ],
    }));
    return;
  }
  if (parsed.type === "suggestions") {
    handlers.updateAssistant((message) => ({
      ...message,
      parts: [
        ...message.parts.filter((part) => part.type !== "suggestions"),
        {
          type: "suggestions",
          content: JSON.stringify(parsed.suggestions),
        },
      ],
    }));
    return;
  }
  if (parsed.type === "impact") {
    handlers.updateAssistant((message) => ({
      ...message,
      parts: [
        ...message.parts.filter((part) => part.type !== "impact"),
        { type: "impact", content: JSON.stringify(parsed.impact) },
      ],
    }));
    return;
  }
  if (parsed.type === "summary") {
    handlers.updateAssistant((message) => ({
      ...message,
      parts: [
        ...message.parts.filter((part) => part.type !== "summary"),
        { type: "summary", content: parsed.summary },
      ],
    }));
    return;
  }
  if (parsed.type === "citations") {
    const citationList =
      "citations" in parsed
        ? parsed.citations
        : "sources" in parsed
          ? (parsed as { sources: ChatCitation[] }).sources
          : [];
    handlers.setCitations(citationList);
    handlers.updateAssistant((message) => ({
      ...message,
      parts: [
        ...message.parts.filter((part) => part.type !== "citations"),
        {
          type: "citations",
          content: JSON.stringify(citationList),
        },
      ],
    }));
    return;
  }
  handlers.updateAssistant((message) => ({
    ...message,
    parts: appendMessagePart(message.parts, parsed.type, parsed.delta),
  }));
}
