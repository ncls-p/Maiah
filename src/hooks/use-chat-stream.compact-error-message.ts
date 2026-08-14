"use client";

import {
  type ChatAttachment,
  type ChatMessage,
  type CodeWorkspaceArtifact,
} from "@/components/chat/chat-types";
import type { AiSdkUIChatStartMetadata } from "@/hooks/ai-sdk-ui-chat-transport";
import type { ReasoningPreset } from "@/modules/agent/reasoning-presets";

export function compactErrorMessage(message: string) {
  const firstLine = message.split("\n", 1)[0]?.trim() || "Chat request failed";
  return firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine;
}

export function appendErrorPart(
  message: ChatMessage,
  error: string,
): ChatMessage {
  const previousPart = message.parts.at(-1);
  if (previousPart?.type === "error" && previousPart.content === error) {
    return { ...message, status: "failed" };
  }
  return {
    ...message,
    status: "failed",
    parts: [...message.parts, { type: "error", content: error }],
  };
}

export interface UseChatStreamOptions {
  agentId: string | null;
  conversationId: string | null;
  workspaceId: string | null;
  canChat: boolean;
  onConversationCreated: (conversationId: string, firstMessage: string) => void;
  onConversationTitle?: (conversationId: string, title: string) => void;
  onConversationMetadata?: (metadata: AiSdkUIChatStartMetadata) => void;
  onConversationsRefresh: () => Promise<void>;
}

export type SubmitOptions = {
  ephemeral?: boolean;
  ephemeralTtlMinutes?: number;
  resendFromMessageId?: string;
  regenerateAssistantMessageId?: string;
  responseVersionConversationIds?: string[];
  reuseUserMessage?: boolean;
  continueFromMessageId?: string;
  codeWorkspaceArtifact?: CodeWorkspaceArtifact;
  codeWorkspaceId?: string;
  attachments?: ChatAttachment[];
  reasoningEffort?: ReasoningPreset;
};
