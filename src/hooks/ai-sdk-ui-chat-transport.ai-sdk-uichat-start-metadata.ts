import { type UIMessageChunk } from "ai";

import type {
  ChatCitation,
  ChatStreamEvent,
  CodeWorkspaceArtifact,
} from "@/components/chat/chat-types";
import { normalizeChatMessageMetrics } from "@/modules/chat/message-metrics";

export type AiSdkUIChatStartMetadata = {
  conversationId?: string;
  messageId?: string;
  userMessageId?: string;
  isEphemeral?: boolean;
  expiresAt?: string;
};

export type StreamAiSdkUIChatOptions = {
  api: string;
  chatId: string;
  content: string;
  localUserMessageId: string;
  resendFromMessageId?: string;
  body: Record<string, unknown>;
  abortSignal: AbortSignal;
  onStart: (metadata: AiSdkUIChatStartMetadata) => void;
  onEvent: (event: ChatStreamEvent) => void;
};

export function readMetadata(value: unknown): AiSdkUIChatStartMetadata {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  return {
    conversationId:
      typeof record.conversationId === "string"
        ? record.conversationId
        : undefined,
    messageId:
      typeof record.messageId === "string" ? record.messageId : undefined,
    userMessageId:
      typeof record.userMessageId === "string"
        ? record.userMessageId
        : undefined,
    isEphemeral:
      typeof record.isEphemeral === "boolean" ? record.isEphemeral : undefined,
    expiresAt:
      typeof record.expiresAt === "string" ? record.expiresAt : undefined,
  };
}

export function readMetricsMetadata(value: unknown) {
  if (typeof value !== "object" || value === null) return undefined;
  const metrics = (value as Record<string, unknown>).metrics;
  if (typeof metrics !== "object" || metrics === null) return undefined;
  return normalizeChatMessageMetrics(metrics);
}

export function isCodeWorkspaceArtifact(
  value: unknown,
): value is CodeWorkspaceArtifact {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "code_workspace_artifact" &&
    typeof record.projectId === "string" &&
    typeof record.version === "number" &&
    Array.isArray(record.files)
  );
}

export function isCitationArray(value: unknown): value is ChatCitation[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const record = item as Record<string, unknown>;
      return (
        typeof record.chunkId === "string" &&
        typeof record.documentId === "string" &&
        typeof record.documentTitle === "string" &&
        typeof record.content === "string" &&
        typeof record.score === "number"
      );
    })
  );
}

export function toolApprovalFromData(data: unknown): ChatStreamEvent | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (
    typeof record.invocationId !== "string" ||
    typeof record.toolName !== "string"
  ) {
    return null;
  }
  return {
    type: "tool_approval_required",
    invocationId: record.invocationId,
    toolName: record.toolName,
    input: record.input,
  };
}

export function titleFromData(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const title = (data as Record<string, unknown>).title;
  return typeof title === "string" ? title : null;
}

export function agentToolContextFromData(data: unknown): {
  toolCallId: string;
  agentContext: unknown;
} | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.toolCallId !== "string") return null;
  return {
    toolCallId: record.toolCallId,
    agentContext: record.agentContext,
  };
}

export function toolInputProgressFromData(
  data: unknown,
): ChatStreamEvent | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (
    typeof record.toolCallId !== "string" ||
    typeof record.toolName !== "string" ||
    typeof record.inputText !== "string"
  ) {
    return null;
  }
  return {
    type: "tool_input_snapshot",
    toolCallId: record.toolCallId,
    toolName: record.toolName,
    inputText: record.inputText,
  };
}

export async function* iterateChunks(stream: ReadableStream<UIMessageChunk>) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
