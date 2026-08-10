"use client";

import type { ChatAgent, ChatConversation } from "@/components/chat/chat-types";

export type AgentDirectoryPayload = {
  agents?: ChatAgent[];
  organizationDefaultAgentId?: string | null;
  userDefaultAgentId?: string | null;
  effectiveDefaultAgentId?: string | null;
  canCreateAgent?: boolean;
  canManageProviders?: boolean;
};

export type ConversationSearchState = {
  query: string;
  conversations: ChatConversation[];
  hasMore: boolean;
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
};

export const EMPTY_CONVERSATION_SEARCH_STATE: ConversationSearchState = {
  query: "",
  conversations: [],
  hasMore: false,
  nextCursor: null,
  loading: false,
  loadingMore: false,
  error: false,
};
