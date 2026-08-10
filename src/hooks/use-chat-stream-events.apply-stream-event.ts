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
import { TOOL_CALL_PART_TYPE } from "./use-chat-stream-events.stored-chat-stream-draft";
export function applyStreamEvent(
  parsed: ChatStreamEvent,
  handlers: {
    updateAssistant: (updater: (message: ChatMessage) => ChatMessage) => void;
    addPendingApproval: (approval: PendingToolApproval) => void;
    clearPendingApprovals: () => void;
    setCitations: (citations: ChatCitation[]) => void;
    onConversationTitle?: (title: string) => void;
    onDone?: () => void;
  },
) {
  if (parsed.type === "error") {
    throw new Error(parsed.error);
  }
  if (parsed.type === "done") {
    handlers.updateAssistant((message) => ({
      ...message,
      status: "completed",
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
  if (parsed.type === "tool_approval_required") {
    handlers.addPendingApproval({
      invocationId: parsed.invocationId,
      toolName: parsed.toolName,
      input: parsed.input,
    });
    return;
  }
  if (parsed.type === "tool_input_start") {
    const content = JSON.stringify({
      toolCallId: parsed.toolCallId,
      toolName: parsed.toolName,
      inputText: "",
      streamingInput: true,
    });
    handlers.updateAssistant((message) => ({
      ...message,
      parts: [...message.parts, { type: TOOL_CALL_PART_TYPE, content }],
    }));
    return;
  }
  if (parsed.type === "tool_input_delta") {
    handlers.updateAssistant((message) => {
      const nextParts = [...message.parts];
      for (let i = nextParts.length - 1; i >= 0; i--) {
        if (nextParts[i].type !== TOOL_CALL_PART_TYPE) continue;
        try {
          const parsedPart = JSON.parse(nextParts[i].content) as Record<
            string,
            unknown
          >;
          if (parsedPart.toolCallId === parsed.toolCallId) {
            nextParts[i] = {
              type: TOOL_CALL_PART_TYPE,
              content: JSON.stringify({
                ...parsedPart,
                inputText: `${typeof parsedPart.inputText === "string" ? parsedPart.inputText : ""}${parsed.delta}`,
                streamingInput: true,
              }),
            };
            return { ...message, parts: nextParts };
          }
        } catch {
          // skip unparsable parts
        }
      }
      return message;
    });
    return;
  }
  if (parsed.type === "tool_input_snapshot") {
    handlers.updateAssistant((message) => {
      const nextParts = [...message.parts];
      for (let i = nextParts.length - 1; i >= 0; i--) {
        if (nextParts[i].type !== TOOL_CALL_PART_TYPE) continue;
        try {
          const parsedPart = JSON.parse(nextParts[i].content) as Record<
            string,
            unknown
          >;
          if (parsedPart.toolCallId === parsed.toolCallId) {
            nextParts[i] = {
              type: TOOL_CALL_PART_TYPE,
              content: JSON.stringify({
                ...parsedPart,
                toolName: parsed.toolName,
                inputText: parsed.inputText,
                streamingInput: true,
              }),
            };
            return { ...message, parts: nextParts };
          }
        } catch {
          // Skip malformed historical parts and append a recoverable snapshot.
        }
      }
      return {
        ...message,
        parts: [
          ...nextParts,
          {
            type: TOOL_CALL_PART_TYPE,
            content: JSON.stringify({
              toolCallId: parsed.toolCallId,
              toolName: parsed.toolName,
              inputText: parsed.inputText,
              streamingInput: true,
            }),
          },
        ],
      };
    });
    return;
  }
  if (parsed.type === "tool_input_end") {
    handlers.updateAssistant((message) => {
      const nextParts = [...message.parts];
      for (let i = nextParts.length - 1; i >= 0; i--) {
        if (nextParts[i].type !== TOOL_CALL_PART_TYPE) continue;
        try {
          const parsedPart = JSON.parse(nextParts[i].content) as Record<
            string,
            unknown
          >;
          if (parsedPart.toolCallId === parsed.toolCallId) {
            nextParts[i] = {
              type: TOOL_CALL_PART_TYPE,
              content: JSON.stringify({
                ...parsedPart,
                streamingInput: false,
              }),
            };
            return { ...message, parts: nextParts };
          }
        } catch {
          // skip unparsable parts
        }
      }
      return message;
    });
    return;
  }
  if (parsed.type === "tool_call") {
    const content = JSON.stringify({
      toolCallId: parsed.toolCallId,
      toolName: parsed.toolName,
      input: parsed.input,
      agentContext: parsed.agentContext,
    });
    handlers.updateAssistant((message) => {
      const nextParts = [...message.parts];
      for (let i = nextParts.length - 1; i >= 0; i--) {
        if (nextParts[i].type !== TOOL_CALL_PART_TYPE) continue;
        try {
          const parsedPart = JSON.parse(nextParts[i].content) as Record<
            string,
            unknown
          >;
          if (parsedPart.toolCallId === parsed.toolCallId) {
            nextParts[i] = { type: TOOL_CALL_PART_TYPE, content };
            return { ...message, parts: nextParts };
          }
        } catch {
          // skip unparsable parts
        }
      }
      return {
        ...message,
        parts: [...nextParts, { type: TOOL_CALL_PART_TYPE, content }],
      };
    });
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
  if (parsed.type === "tool_result") {
    // Merge result into the matching tool-call part by toolCallId, but keep
    // unmatched results visible for resumed or legacy streams.
    handlers.updateAssistant((message) => {
      const nextParts = [...message.parts];
      let matched = false;
      for (let i = 0; i < nextParts.length; i++) {
        if (nextParts[i].type !== TOOL_CALL_PART_TYPE) continue;
        try {
          const parsedPart = JSON.parse(nextParts[i].content) as Record<
            string,
            unknown
          >;
          if (parsedPart.toolCallId === parsed.toolCallId) {
            nextParts[i] = {
              type: TOOL_CALL_PART_TYPE,
              content: JSON.stringify({
                ...parsedPart,
                toolName: parsedPart.toolName ?? parsed.toolName,
                output: parsed.output,
                agentContext: parsed.agentContext ?? parsedPart.agentContext,
              }),
            };
            matched = true;
            break;
          }
        } catch {
          // skip unparsable parts
        }
      }
      if (!matched) {
        nextParts.push({
          type: "tool-result",
          content: JSON.stringify({
            toolCallId: parsed.toolCallId,
            toolName: parsed.toolName,
            output: parsed.output,
            agentContext: parsed.agentContext,
          }),
        });
      }
      return { ...message, parts: nextParts };
    });
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
