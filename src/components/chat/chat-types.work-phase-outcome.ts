
import { ChatCitation, ChatMessage, ChatMessagePart } from "./chat-types.chat-agent";
import { ChatMessagePartGroup, IndexedChatMessagePart, isMeaningfulTextPart, isWorkPhasePart, resolveToolDisplayStatus, workPhaseHasPendingWork } from "./chat-types.chat-stream-event";


function workPhaseHasToolErrors(
  parts: ChatMessagePart[],
  messageStatus?: ChatMessage["status"],
) {
  return parts.some(
    (part) =>
      (part.type === "tool-call" || part.type === "tool-result") &&
      resolveToolDisplayStatus(parseToolPart(part.content), messageStatus) ===
        "error",
  );
}

function workPhaseHasRecoveredToolError(
  parts: ChatMessagePart[],
  messageStatus?: ChatMessage["status"],
) {
  let hasUnrecoveredError = false;

  for (const part of parts) {
    if (part.type !== "tool-call" && part.type !== "tool-result") continue;
    const status = resolveToolDisplayStatus(
      parseToolPart(part.content),
      messageStatus,
    );
    if (status === "error") {
      hasUnrecoveredError = true;
    } else if (status === "completed" && hasUnrecoveredError) {
      hasUnrecoveredError = false;
    }
  }

  return workPhaseHasToolErrors(parts, messageStatus) && !hasUnrecoveredError;
}

export type WorkPhaseOutcome =
  "pending" | "completed" | "completed-with-issues" | "interrupted";

export function resolveWorkPhaseOutcome(input: {
  parts: ChatMessagePart[];
  messageStatus?: ChatMessage["status"];
  hasVisibleResponseAfter: boolean;
}): WorkPhaseOutcome {
  const hasToolErrors = workPhaseHasToolErrors(
    input.parts,
    input.messageStatus,
  );
  const hasRecoveredToolError = workPhaseHasRecoveredToolError(
    input.parts,
    input.messageStatus,
  );
  if (
    workPhaseHasPendingWork(input.parts, input.messageStatus) ||
    (input.messageStatus === "streaming" && !input.hasVisibleResponseAfter)
  ) {
    return "pending";
  }
  if (
    input.messageStatus === "failed" ||
    (hasToolErrors && !hasRecoveredToolError && !input.hasVisibleResponseAfter)
  ) {
    return "interrupted";
  }
  return hasToolErrors ? "completed-with-issues" : "completed";
}

export function groupWorkPhaseParts(
  parts: ChatMessagePart[],
  options: {
    isStandalonePart?: (part: ChatMessagePart) => boolean;
  } = {},
): ChatMessagePartGroup[] {
  const groups: ChatMessagePartGroup[] = [];
  const canGroupPart = (part: ChatMessagePart) =>
    isWorkPhasePart(part) && !options.isStandalonePart?.(part);

  for (let partIndex = 0; partIndex < parts.length;) {
    const part = parts[partIndex];
    if (!canGroupPart(part)) {
      groups.push({ type: "part", part, partIndex });
      partIndex += 1;
      continue;
    }

    const phaseStart = partIndex;
    const phaseParts: IndexedChatMessagePart[] = [];
    while (partIndex < parts.length && canGroupPart(parts[partIndex])) {
      phaseParts.push({ part: parts[partIndex], partIndex });
      partIndex += 1;
    }

    if (phaseParts.length < 2) {
      groups.push({ type: "part", part, partIndex: phaseStart });
      continue;
    }

    groups.push({
      type: "work-phase",
      parts: phaseParts,
      hasVisibleResponseAfter: parts
        .slice(partIndex)
        .some(
          (candidate) =>
            isMeaningfulTextPart(candidate) ||
            candidate.type === "file" ||
            Boolean(options.isStandalonePart?.(candidate)),
        ),
    });
  }

  return groups;
}

export function citationsFromMessage(message: ChatMessage): ChatCitation[] {
  const part = message.parts.find((p) => p.type === "citations");
  if (!part?.content) return [];
  try {
    return JSON.parse(part.content) as ChatCitation[];
  } catch {
    return [];
  }
}

export function parseToolPart(content: string): {
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  inputText?: string;
  streamingInput?: boolean;
  denied?: boolean;
  invalid?: boolean;
  error?: unknown;
  message?: string;
  agentContext?: unknown;
} {
  if (!content) return {};
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return parsed as ReturnType<typeof parseToolPart>;
  } catch {
    return { output: content };
  }
}

function isDeniedToolOutput(output: unknown) {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { denied?: unknown }).denied === true
  );
}

function isFailedToolOutput(output: unknown) {
  if (typeof output !== "object" || output === null) return false;
  const record = output as Record<string, unknown>;
  return (
    record.ok === false ||
    record.success === false ||
    record.status === "error" ||
    record.status === "failed" ||
    (record.error !== undefined &&
      record.error !== null &&
      record.error !== false &&
      record.error !== "")
  );
}

export function getToolStatus(
  parsed: ReturnType<typeof parseToolPart>,
): "pending" | "completed" | "error" {
  if (
    parsed.denied ||
    parsed.invalid ||
    parsed.error != null ||
    isDeniedToolOutput(parsed.output) ||
    isFailedToolOutput(parsed.output)
  ) {
    return "error";
  }
  if (parsed.output !== undefined) return "completed";
  return "pending";
}

export function createLocalMessage(
  role: "user" | "assistant",
  content: string,
  extraParts: ChatMessagePart[] = [],
): ChatMessage {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    status: role === "assistant" ? "streaming" : "completed",
    parts: [{ type: "text", content }, ...extraParts],
    createdAt: new Date().toISOString(),
  };
}

export function appendMessagePart(
  parts: ChatMessage["parts"],
  type: "text" | "reasoning",
  delta: string,
) {
  const nextParts = [...parts];
  const lastPart = nextParts.at(-1);

  if (lastPart?.type !== type) {
    return [
      ...nextParts,
      {
        type,
        content: delta,
        ...(type === "reasoning" ? { state: "streaming" as const } : {}),
      },
    ];
  }

  nextParts[nextParts.length - 1] = {
    ...lastPart,
    content: `${lastPart.content}${delta}`,
    ...(type === "reasoning" ? { state: "streaming" as const } : {}),
  };
  return nextParts;
}
