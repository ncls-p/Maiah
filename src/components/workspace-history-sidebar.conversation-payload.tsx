"use client";

import type {
  ChatAgent,
  ChatConversation,
  ChatConversationFolder,
} from "@/components/chat/chat-types";

export type ConversationPayload =
  | ChatConversation[]
  | {
      conversations?: ChatConversation[];
      folders?: ChatConversationFolder[];
    };

export type AgentPayload = ChatAgent[] | { agents?: ChatAgent[] };

export function normalizeConversations(payload: ConversationPayload) {
  if (Array.isArray(payload)) {
    return { conversations: payload, folders: [] };
  }
  return {
    conversations: payload.conversations ?? [],
    folders: payload.folders ?? [],
  };
}

export function withConversationLiveState(
  conversations: ChatConversation[],
  live: { streamingIds: Set<string>; unreadIds: Set<string> },
) {
  if (live.streamingIds.size === 0 && live.unreadIds.size === 0) {
    return conversations;
  }
  return conversations.map((conversation) => {
    const isStreaming = live.streamingIds.has(conversation.id);
    const isUnread = !isStreaming && live.unreadIds.has(conversation.id);
    if (!isStreaming && !isUnread) return conversation;
    return { ...conversation, isStreaming, isUnread };
  });
}
