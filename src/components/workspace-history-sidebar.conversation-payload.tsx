"use client";

import type { ChatAgent,ChatConversation,ChatConversationFolder } from "@/components/chat/chat-types";

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
