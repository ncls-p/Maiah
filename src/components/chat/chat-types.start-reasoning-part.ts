import { ChatMessage } from "./chat-types.chat-agent";
import { ChatStreamEvent } from "./chat-types.chat-stream-event";

export function startReasoningPart(
  parts: ChatMessage["parts"],
): ChatMessage["parts"] {
  const lastPart = parts.at(-1);
  if (lastPart?.type === "reasoning" && lastPart.state === "streaming") {
    return parts;
  }
  return [
    ...parts,
    { type: "reasoning", content: "", state: "streaming" as const },
  ];
}

export function completeReasoningParts(parts: ChatMessage["parts"]) {
  let changed = false;
  const nextParts = parts.map((part) => {
    if (part.type !== "reasoning" || part.state !== "streaming") return part;
    changed = true;
    return { ...part, state: "done" as const };
  });
  return changed ? nextParts : parts;
}

type StreamEventCandidate = Record<string, unknown> & { type?: unknown };

type StreamEventValidator = (event: StreamEventCandidate) => boolean;

const hasStringDelta: StreamEventValidator = (event) =>
  typeof event.delta === "string";

const hasToolIdentity: StreamEventValidator = (event) =>
  typeof event.toolCallId === "string" && typeof event.toolName === "string";

const STREAM_EVENT_VALIDATORS: Record<string, StreamEventValidator> = {
  text: hasStringDelta,
  reasoning: hasStringDelta,
  reasoning_start: () => true,
  reasoning_end: () => true,
  error: (event) => typeof event.error === "string",
  done: () => true,
  tool_approval_required: (event) =>
    typeof event.invocationId === "string" &&
    typeof event.toolName === "string",
  tool_input_start: hasToolIdentity,
  tool_input_delta: (event) =>
    typeof event.toolCallId === "string" && typeof event.delta === "string",
  tool_input_snapshot: (event) =>
    hasToolIdentity(event) && typeof event.inputText === "string",
  tool_input_end: (event) => typeof event.toolCallId === "string",
  tool_call: hasToolIdentity,
  tool_result: hasToolIdentity,
  file: (event) => typeof event.artifact === "object",
  conversation_title: (event) => typeof event.title === "string",
  suggestions: (event) =>
    Array.isArray(event.suggestions) &&
    event.suggestions.every((item) => typeof item === "string"),
  impact: (event) => typeof event.impact === "object" && event.impact !== null,
  summary: (event) => typeof event.summary === "string",
  citations: (event) =>
    Array.isArray(event.citations) || Array.isArray(event.sources),
};

export function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  const event = value as StreamEventCandidate;
  const validator =
    typeof event.type === "string"
      ? STREAM_EVENT_VALIDATORS[event.type]
      : undefined;

  return validator?.(event) ?? false;
}
