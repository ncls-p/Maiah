import {
  ChatCitation,
  ChatMessage,
  ChatMessagePart,
  ChatUsageImpact,
  CodeWorkspaceArtifact,
} from "./chat-types.chat-agent";
import { getToolStatus, parseToolPart } from "./chat-types.work-phase-outcome";

export type ChatStreamEvent =
  | { type: "text" | "reasoning"; delta: string }
  | { type: "reasoning_start" }
  | { type: "reasoning_end" }
  | { type: "done" }
  | { type: "error"; error: string }
  | { type: "conversation_title"; title: string }
  | { type: "suggestions"; suggestions: string[] }
  | { type: "impact"; impact: ChatUsageImpact }
  | { type: "summary"; summary: string; inputTokens: number | null }
  | {
      type: "tool_approval_required";
      invocationId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "tool_input_start";
      toolCallId: string;
      toolName: string;
    }
  | {
      type: "tool_input_delta";
      toolCallId: string;
      delta: string;
    }
  | {
      type: "tool_input_snapshot";
      toolCallId: string;
      toolName: string;
      inputText: string;
    }
  | {
      type: "tool_input_end";
      toolCallId: string;
    }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      input: unknown;
      agentContext?: unknown;
    }
  | {
      type: "tool_result";
      toolCallId: string;
      toolName: string;
      output: unknown;
      agentContext?: unknown;
    }
  | { type: "file"; artifact: CodeWorkspaceArtifact }
  | { type: "citations"; citations: ChatCitation[] };

export function textFromMessage(message: ChatMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.content)
    .join("\n");
}

export function canContinueAssistantMessage(
  message: ChatMessage,
  lastAssistantMessageId: string | null | undefined,
) {
  return (
    message.role === "assistant" &&
    message.id === lastAssistantMessageId &&
    message.status !== "streaming" &&
    textFromMessage(message).trim().length > 0
  );
}

export function prepareAssistantMessageContinuation(message: ChatMessage) {
  return {
    ...message,
    status: "streaming",
    parts: message.parts.filter(
      (part) => part.type !== "suggestions" && part.type !== "impact",
    ),
  };
}

export function preserveAssistantFailureParts(parts: ChatMessagePart[]) {
  return parts.length > 0
    ? parts
    : [{ type: "text", content: "The assistant failed to respond." }];
}

function parseToolPartRecord(part: ChatMessagePart) {
  try {
    return JSON.parse(part.content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mergeToolParts(parts: ChatMessagePart[]): ChatMessagePart[] {
  const callsById = new Set<string>();
  const resultsByCallId = new Map<string, Record<string, unknown>>();

  for (const part of parts) {
    const parsed = parseToolPartRecord(part);
    if (!parsed || typeof parsed.toolCallId !== "string") continue;
    const callId = parsed.toolCallId;

    if (part.type === "tool-call") {
      callsById.add(callId);
    } else if (part.type === "tool-result") {
      resultsByCallId.set(callId, parsed);
    }
  }

  return parts.flatMap((part) => {
    if (part.type === "tool-call") {
      const parsed = parseToolPartRecord(part);
      if (!parsed || typeof parsed.toolCallId !== "string") return [part];

      const result = resultsByCallId.get(parsed.toolCallId);
      if (!result) return [part];

      return [
        {
          type: "tool-call",
          content: JSON.stringify({
            ...parsed,
            toolName: parsed.toolName ?? result.toolName,
            output: result.output,
            agentContext: result.agentContext ?? parsed.agentContext,
          }),
        },
      ];
    }

    if (part.type === "tool-result") {
      const parsed = parseToolPartRecord(part);
      const callId = parsed?.toolCallId;
      return typeof callId === "string" && callsById.has(callId) ? [] : [part];
    }

    return [part];
  });
}

export function renderablePartsFromMessage(message: ChatMessage) {
  return mergeToolParts(message.parts).filter((part) =>
    [
      "text",
      "file",
      "reasoning",
      "tool-call",
      "tool-result",
      "suggestions",
      "impact",
      "summary",
    ].includes(part.type),
  );
}

export function reasoningPartHasDetails(part: ChatMessagePart) {
  return (
    part.type === "reasoning" &&
    (part.state === "streaming" || part.content.trim().length > 0)
  );
}

export type IndexedChatMessagePart = {
  part: ChatMessagePart;
  partIndex: number;
};

export type ChatMessagePartGroup =
  | ({ type: "part" } & IndexedChatMessagePart)
  | {
      type: "work-phase";
      parts: IndexedChatMessagePart[];
      hasVisibleResponseAfter: boolean;
    };

export function isWorkPhasePart(part: ChatMessagePart) {
  return ["reasoning", "tool-call", "tool-result"].includes(part.type);
}

export function isMeaningfulTextPart(part: ChatMessagePart) {
  return part.type === "text" && part.content.trim().length > 0;
}

export function workPhaseHasPendingWork(
  parts: ChatMessagePart[],
  messageStatus: ChatMessage["status"],
) {
  if (messageStatus !== "streaming") return false;
  return parts.some(
    (part) =>
      (part.type === "reasoning" && part.state === "streaming") ||
      ((part.type === "tool-call" || part.type === "tool-result") &&
        getToolStatus(parseToolPart(part.content)) === "pending"),
  );
}

function agentStatusFromToolPart(
  parsed: ReturnType<typeof parseToolPart>,
): "running" | "success" | "error" | undefined {
  const context = parsed.agentContext;
  if (typeof context !== "object" || context === null) return undefined;
  const status = (context as { status?: unknown }).status;
  return status === "running" || status === "success" || status === "error"
    ? status
    : undefined;
}

export function resolveToolDisplayStatus(
  parsed: ReturnType<typeof parseToolPart>,
  messageStatus?: ChatMessage["status"],
): "pending" | "completed" | "error" {
  const toolStatus = getToolStatus(parsed);
  const agentStatus = agentStatusFromToolPart(parsed);
  if (agentStatus === "error" || toolStatus === "error") return "error";
  if (agentStatus === "success") return "completed";
  if (toolStatus !== "pending") return toolStatus;
  if (messageStatus === "streaming") return "pending";
  return messageStatus === "failed" ? "error" : "completed";
}
