"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { QueuedChatMessage } from "@/components/chat/chat-composer";
import type {
  AgentVersion,
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  CodeWorkspaceArtifact,
} from "@/components/chat/chat-types";
import { createChatHref } from "@/lib/chat-navigation";

type Setter<T> = Dispatch<SetStateAction<T>>;

type ConversationActionsContext = {
  selectedAgentId: string | null;
  activeConversationId: string | null;
  conversations: ChatConversation[];
  newConversationAgentIdRef: MutableRefObject<string | null>;
  setSelectedAgentId: Setter<string | null>;
  setActiveConversationId: Setter<string | null>;
  setActiveVersion: Setter<AgentVersion | null>;
  setQueuedMessages: Setter<QueuedChatMessage[]>;
  setMessages: (messages: ChatMessage[]) => void;
  setCodeWorkspaceArtifact: Setter<CodeWorkspaceArtifact | null>;
  setAttachments: Setter<ChatAttachment[]>;
  detachActiveStream: () => void;
  restoreComposerDraft: (
    agentId: string,
    conversationId: string | null,
  ) => void;
  resetInterfaceMode: () => void;
};

export function useConversationActions(context: ConversationActionsContext) {
  const c = context;
  function selectAgent(agentId: string) {
    if (agentId === c.selectedAgentId) return;
    c.setQueuedMessages([]);
    c.setSelectedAgentId(agentId);
    c.setActiveVersion(null);
    if (!c.activeConversationId) {
      c.newConversationAgentIdRef.current = agentId;
      c.restoreComposerDraft(agentId, null);
      c.setMessages([]);
      c.setCodeWorkspaceArtifact(null);
      c.resetInterfaceMode();
    }
    window.history.replaceState(
      null,
      "",
      createChatHref({
        pathname: window.location.pathname,
        agentId,
        conversationId: c.activeConversationId,
      }),
    );
  }

  function selectConversation(
    conversationId: string,
    conversationAgentId?: string | null,
  ) {
    if (conversationId === c.activeConversationId) return;
    c.detachActiveStream();
    c.setQueuedMessages([]);
    c.setMessages([]);
    c.setCodeWorkspaceArtifact(null);
    c.setAttachments([]);
    c.resetInterfaceMode();
    const nextAgentId =
      c.conversations.find((item) => item.id === conversationId)?.agentId ??
      conversationAgentId;
    c.restoreComposerDraft(
      nextAgentId ?? c.selectedAgentId ?? "",
      conversationId,
    );
    if (nextAgentId) c.setSelectedAgentId(nextAgentId);
    c.setActiveConversationId(conversationId);
    window.history.replaceState(
      null,
      "",
      createChatHref({
        pathname: window.location.pathname,
        agentId: nextAgentId,
        conversationId,
      }),
    );
  }

  function startNewConversation() {
    const nextAgentId =
      c.newConversationAgentIdRef.current ?? c.selectedAgentId;
    c.detachActiveStream();
    c.setQueuedMessages([]);
    c.setActiveConversationId(null);
    if (nextAgentId && nextAgentId !== c.selectedAgentId) {
      c.setSelectedAgentId(nextAgentId);
      c.setActiveVersion(null);
    }
    c.setMessages([]);
    c.setCodeWorkspaceArtifact(null);
    if (nextAgentId) c.restoreComposerDraft(nextAgentId, null);
    c.resetInterfaceMode();
    window.history.replaceState(
      null,
      "",
      createChatHref({
        pathname: window.location.pathname,
        agentId: nextAgentId,
      }),
    );
  }

  return { selectAgent, selectConversation, startNewConversation };
}
