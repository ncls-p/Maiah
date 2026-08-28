"use client";
import { TOOL_CALL_PART_TYPE } from "./use-chat-stream-events.stored-chat-stream-draft";
import type {
  ApplyStreamEventHandlers,
  ToolStreamEvent,
} from "./use-chat-stream-events.apply-stream-event.part-a";

export function applyStreamEventTool(
  parsed: ToolStreamEvent,
  handlers: ApplyStreamEventHandlers,
) {
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
}
