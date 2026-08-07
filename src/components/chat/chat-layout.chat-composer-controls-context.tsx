"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import type {
  ChatAgent,
  ChatUsageImpact,
} from "@/components/chat/chat-types";

export interface ChatComposerControls {
  primary: ReactNode;
  secondary: ReactNode;
}

const EMPTY_COMPOSER_CONTROLS: ChatComposerControls = {
  primary: null,
  secondary: null,
};

export const ChatComposerControlsContext = createContext<ChatComposerControls>(
  EMPTY_COMPOSER_CONTROLS,
);

export function useChatComposerControls() {
  return useContext(ChatComposerControlsContext);
}

export interface ChatLayoutProps {
  agents: ChatAgent[];
  selectedAgent: ChatAgent | null;
  selectedAgentId: string | null;
  activeConversationId: string | null;
  conversationImpact?: ChatUsageImpact | null;
  organizationDefaultAgentId?: string | null;
  userDefaultAgentId?: string | null;
  canChat: boolean;
  canCreateAgent?: boolean;
  canRunSetup?: boolean;
  onSelectAgent: (agentId: string) => void;
  onSetUserDefaultAgent?: (agentId: string | null) => void;
  onSetupComplete?: () => void;
  children: React.ReactNode;
}
