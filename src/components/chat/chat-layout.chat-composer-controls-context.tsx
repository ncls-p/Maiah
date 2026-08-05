"use client";

import {
createContext,
useContext,
type ComponentProps,
type ReactNode
} from "react";

import { ChatSidebar } from "@/components/chat/chat-sidebar";
import type {
ChatAgent,
ChatConversation,
ChatConversationFolder,
ChatUsageImpact,
} from "@/components/chat/chat-types";

export const ChatComposerControlsContext = createContext<ReactNode>(null);

export function useChatComposerControls() {
  return useContext(ChatComposerControlsContext);
}

export type ChatSidebarCollapsedChangeHandler = NonNullable<
  ComponentProps<typeof ChatSidebar>["onCollapsedChange"]
>;

export interface ChatLayoutProps {
  agents: ChatAgent[];
  conversations: ChatConversation[];
  conversationFolders: ChatConversationFolder[];
  selectedAgent: ChatAgent | null;
  selectedAgentId: string | null;
  activeConversationId: string | null;
  conversationImpact?: ChatUsageImpact | null;
  organizationDefaultAgentId?: string | null;
  userDefaultAgentId?: string | null;
  canChat: boolean;
  canCreateAgent?: boolean;
  canRunSetup?: boolean;
  loadingSidebar?: boolean;
  conversationSearchQuery: string;
  conversationSearchResults: ChatConversation[];
  searchingConversations?: boolean;
  conversationSearchError?: boolean;
  hasMoreConversationSearchResults?: boolean;
  loadingMoreConversationSearchResults?: boolean;
  onConversationSearchQueryChange: (query: string) => void;
  onRetryConversationSearch?: () => void;
  onLoadMoreConversationSearchResults?: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectConversation: (
    conversationId: string,
    conversationAgentId?: string | null,
  ) => void;
  onNewConversation: () => void;
  onSetUserDefaultAgent?: (agentId: string | null) => void;
  onRenameConversation?: (conversationId: string, title: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onCreateConversationFolder?: (name: string) => void;
  onRenameConversationFolder?: (folderId: string, name: string) => void;
  onDeleteConversationFolder?: (folderId: string) => void;
  onToggleConversationPin?: (conversationId: string, pinned: boolean) => void;
  onReorderConversations?: (input: {
    conversationIds: string[];
    folderId: string | null;
    pinned?: boolean;
  }) => void;
  hasMoreConversations?: boolean;
  loadingMoreConversations?: boolean;
  onLoadMoreConversations?: () => void;
  onSetupComplete?: () => void;
  children: React.ReactNode;
}
