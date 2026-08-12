"use client";

import { useTranslations } from "next-intl";
import type * as React from "react";
import { useEffect, useRef } from "react";

import {
  textFromMessage,
  type ChatMessage,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import type { WorkspaceArtifactDisplay } from "@/components/chat/code-workspace-artifact-card";
import { useMessageScroller } from "@/components/ui/message-scroller";

export const INITIAL_VISIBLE_MESSAGES = 60;
export const LOAD_MORE_MESSAGES = 30;
export const EMPTY_PENDING_APPROVALS: PendingToolApproval[] = [];
export const BUTTON_TYPE = "button";
export const OUTLINE_VARIANT = "outline";
export const GHOST_VARIANT = "ghost";
export const COMPACT_ICON_CLASS = "size-3";
const USER_MESSAGE_PREVIEW_LENGTH = 180;
export const MESSAGE_JUMP_SCROLL_MARGIN = 24;

export interface ChatMessageListProps {
  messages: ChatMessage[];
  sending: boolean;
  loading?: boolean;
  workspaceId?: string;
  workspaceArtifactDisplay?: WorkspaceArtifactDisplay;
  conversationId?: string | null;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onEditMessage?: (
    message: ChatMessage,
    content: string,
  ) => Promise<void> | void;
  onDeleteMessage?: (message: ChatMessage) => Promise<void> | void;
  onResendMessage?: (message: ChatMessage) => Promise<void> | void;
  onRegenerateAssistant?: (message: ChatMessage) => Promise<void> | void;
  onContinueAssistant?: (message: ChatMessage) => Promise<void> | void;
  onJumpLatest?: () => Promise<void> | void;
  pendingApprovals?: PendingToolApproval[];
  onApproveTool?: (approval: PendingToolApproval) => void;
  onRejectTool?: (approval: PendingToolApproval) => void;
  onSuggestionClick?: (suggestion: string) => void;
}

export function SavedMessageAnchorRestorer({
  conversationId,
}: {
  conversationId?: string | null;
}) {
  const { scrollToMessage } = useMessageScroller();
  const restoredConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !conversationId ||
      restoredConversationIdRef.current === conversationId
    ) {
      return;
    }
    restoredConversationIdRef.current = conversationId;
    const hashMessageId = window.location.hash.startsWith("#message-")
      ? window.location.hash.slice("#message-".length)
      : null;
    if (!hashMessageId) return;
    const frame = window.requestAnimationFrame(() => {
      scrollToMessage(hashMessageId, {
        align: "start",
        behavior: "auto",
        scrollMargin: 24,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationId, scrollToMessage]);

  return null;
}

export interface UserMessageShortcut {
  id: string;
  messageIndex: number;
  ordinal: number;
  preview: string;
  fullText: string;
}

type MessageListTranslator = ReturnType<
  typeof useTranslations<"chat.messageList">
>;

function fallbackUserMessageText(
  message: ChatMessage,
  t: MessageListTranslator,
) {
  const attachmentCount = message.parts.filter(
    (part) => part.type === "file" || part.type === "image",
  ).length;
  if (attachmentCount > 0)
    return t("messageWithAttachments", { count: attachmentCount });

  return t("emptyUserMessage");
}

export function userMessageFullText(
  message: ChatMessage,
  t: MessageListTranslator,
) {
  return textFromMessage(message).trim() || fallbackUserMessageText(message, t);
}

export function userMessagePreview(
  message: ChatMessage,
  t: MessageListTranslator,
) {
  const normalizedText = userMessageFullText(message, t)
    .replace(/\s+/g, " ")
    .trim();
  if (normalizedText.length > USER_MESSAGE_PREVIEW_LENGTH) {
    return `${normalizedText.slice(0, USER_MESSAGE_PREVIEW_LENGTH).trimEnd()}…`;
  }

  return normalizedText;
}

export function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function rememberUserMessageAnchor(messageId: string) {
  window.history.replaceState(null, "", `#message-${messageId}`);
}
