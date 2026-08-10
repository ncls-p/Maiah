"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { QueuedChatMessage } from "@/components/chat/chat-composer";
import { migrateNewChatComposerDraft } from "@/components/chat/chat-composer-draft";
import { latestChatTodoListFromMessages } from "@/components/chat/chat-message-rendering-utils";
import type { AgentVersion, ChatConversation, ChatMessage, CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import { aggregateChatUsageImpact } from "@/components/chat/chat-types";
import { useChatStream } from "@/hooks/use-chat-stream";
import { fetchJson } from "@/lib/api-client";
import { notifyWorkspaceHistoryChanged } from "@/lib/workspace-history-events";

import { CHAT_INTERFACE_MODE, CODING_INTERFACE_MODE, shouldAutoActivateCoding, type InterfaceMode } from "./chat-interface-mode";
import { conversationTitleFromFirstMessage, latestCodeWorkspaceArtifact, upsertConversation } from "./chat-page-helpers";

type Setter<T> = Dispatch<SetStateAction<T>>;
type SessionContext = {
  workspaceId: string | null;
  selectedAgentId: string | null;
  activeConversationId: string | null;
  ephemeral: boolean;
  queuedMessages: QueuedChatMessage[];
  interfaceMode: InterfaceMode;
  codeWorkspaceArtifact: CodeWorkspaceArtifact | null;
  lastAutoOpenedWorkspaceRef: MutableRefObject<string | null>;
  userSelectedInterfaceModeRef: MutableRefObject<InterfaceMode | null>;
  composerDraftScopeRef: MutableRefObject<{
    workspaceId: string;
    agentId: string;
    conversationId: string | null;
  } | null>;
  saveCurrentComposerDraft: () => void;
  resetInterfaceMode: () => void;
  refreshConversations: () => Promise<void>;
  setActiveConversationId: Setter<string | null>;
  setSelectedAgentId: Setter<string | null>;
  setConversations: Setter<ChatConversation[]>;
  setQueuedMessages: Setter<QueuedChatMessage[]>;
  setCodeWorkspaceArtifact: Setter<CodeWorkspaceArtifact | null>;
  setInterfaceMode: Setter<InterfaceMode>;
  setLoadingContext: Setter<boolean>;
};

export function useChatSession(c: SessionContext) {
  const { workspaceId, selectedAgentId, activeConversationId, ephemeral, queuedMessages, interfaceMode, codeWorkspaceArtifact, lastAutoOpenedWorkspaceRef, userSelectedInterfaceModeRef, composerDraftScopeRef, saveCurrentComposerDraft, resetInterfaceMode, refreshConversations, setActiveConversationId, setSelectedAgentId, setConversations, setQueuedMessages, setCodeWorkspaceArtifact, setInterfaceMode, setLoadingContext } = c;
  const [activeVersion, setActiveVersion] = useState<AgentVersion | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [conversationCanContinue, setConversationCanContinue] = useState(true);
  const [conversationIsOwner, setConversationIsOwner] = useState(true);
  const processingQueuedMessageRef = useRef(false);
  const skipNextMessageLoadRef = useRef(false);
  const canChat = Boolean(activeVersion?.providerId && activeVersion?.modelId && conversationCanContinue);
  const stream = useChatStream({
    agentId: selectedAgentId,
    conversationId: activeConversationId,
    workspaceId: workspaceId,
    canChat,
    onConversationCreated: (conversationId, firstMessage) => {
      skipNextMessageLoadRef.current = true;
      if (workspaceId && selectedAgentId) {
        saveCurrentComposerDraft();
        migrateNewChatComposerDraft(workspaceId, selectedAgentId, conversationId);
        composerDraftScopeRef.current = {
          workspaceId: workspaceId,
          agentId: selectedAgentId,
          conversationId,
        };
      }
      setActiveConversationId(conversationId);
      if (selectedAgentId && !ephemeral) {
        setConversations((current) =>
          upsertConversation(current, {
            id: conversationId,
            title: conversationTitleFromFirstMessage(firstMessage),
            agentId: selectedAgentId!,
            folderId: null,
            pinnedAt: null,
            sidebarOrder: null,
            updatedAt: new Date().toISOString(),
          }),
        );
      }
      const params = new URLSearchParams();
      if (selectedAgentId) params.set("agentId", selectedAgentId);
      params.set("conversationId", conversationId);
      window.history.replaceState(null, "", `/chat?${params.toString()}`);
      if (!ephemeral) notifyWorkspaceHistoryChanged();
    },
    onConversationTitle: (conversationId, title) => {
      setConversations((current) => {
        let found = false;
        const next = current.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          found = true;
          return { ...conversation, title };
        });
        return found || !selectedAgentId
          ? next
          : [
              {
                id: conversationId,
                title,
                agentId: selectedAgentId,
                updatedAt: new Date().toISOString(),
              },
              ...next,
            ];
      });
      notifyWorkspaceHistoryChanged();
    },
    onConversationsRefresh: refreshConversations,
  });
  const { messages, setMessages, sending, handleSubmit } = stream;
  const latestTodoList = useMemo(() => latestChatTodoListFromMessages(messages), [messages]);
  const conversationImpact = useMemo(() => aggregateChatUsageImpact(messages), [messages]);

  useEffect(() => {
    const artifact = latestCodeWorkspaceArtifact(messages);
    if (!artifact) return;
    queueMicrotask(() => {
      setCodeWorkspaceArtifact((current) => (current?.projectId === artifact.projectId && artifact.version <= current.version ? current : artifact));
      if (!sending || !shouldAutoActivateCoding(userSelectedInterfaceModeRef.current)) return;
      const key = `${artifact.projectId}:${artifact.version}`;
      if (lastAutoOpenedWorkspaceRef.current === key) return;
      lastAutoOpenedWorkspaceRef.current = key;
      setInterfaceMode(CODING_INTERFACE_MODE);
    });
  }, [lastAutoOpenedWorkspaceRef, setCodeWorkspaceArtifact, setInterfaceMode, userSelectedInterfaceModeRef, messages, sending]);

  useEffect(() => {
    if (sending || !canChat || queuedMessages.length === 0 || processingQueuedMessageRef.current) return;
    const next = queuedMessages[0];
    if (!next?.content.trim()) return void queueMicrotask(() => setQueuedMessages((current) => current.slice(1)));
    processingQueuedMessageRef.current = true;
    queueMicrotask(() => {
      setQueuedMessages((current) => (current[0]?.id === next.id ? current.slice(1) : current.filter(({ id }) => id !== next.id)));
      void handleSubmit(next.content.trim(), {
        codeWorkspaceId: interfaceMode === CODING_INTERFACE_MODE ? codeWorkspaceArtifact?.projectId : undefined,
        ephemeral: !activeConversationId && ephemeral,
      }).finally(() => {
        processingQueuedMessageRef.current = false;
      });
    });
  }, [activeConversationId, codeWorkspaceArtifact, ephemeral, interfaceMode, queuedMessages, setQueuedMessages, canChat, handleSubmit, sending]);

  useEffect(() => {
    if (!selectedAgentId || !workspaceId) return;
    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => setLoadingContext(true));
    void fetchJson<AgentVersion[]>(`/api/workspace/agents/${selectedAgentId}/versions?workspaceId=${workspaceId}`, { signal: controller.signal })
      .then((versions) => {
        if (!cancelled) setActiveVersion(versions.find(({ isActive }) => isActive) ?? null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") toast.error(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedAgentId, setLoadingContext, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void fetchJson<{ quota: { used: number; limit: number } | null }>(`/api/workspace/usage?workspaceId=${workspaceId}&limit=1`)
      .then((data) => {
        if (!cancelled && data.quota) setQuota(data.quota);
      })
      .catch(() => {
        if (!cancelled) setQuota(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!activeConversationId) {
      skipNextMessageLoadRef.current = false;
      queueMicrotask(() => {
        setConversationCanContinue(true);
        setConversationIsOwner(true);
        setMessages([]);
        setCodeWorkspaceArtifact(null);
        resetInterfaceMode();
      });
      return;
    }
    if (skipNextMessageLoadRef.current) {
      skipNextMessageLoadRef.current = false;
      queueMicrotask(() => setLoadingMessages(false));
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => setLoadingMessages(true));
    void fetchJson<{
      conversation?: ChatConversation;
      messages?: ChatMessage[];
    }>(`/api/workspace/conversations/${activeConversationId}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (cancelled) return;
        if (data.conversation?.agentId && !new URL(window.location.href).searchParams.get("agentId")) setSelectedAgentId(data.conversation.agentId);
        if (data.conversation) {
          setConversationCanContinue(data.conversation.canContinue !== false);
          setConversationIsOwner(data.conversation.isOwner !== false);
          if (!data.conversation.isEphemeral) {
            setConversations((current) => upsertConversation(current, data.conversation!));
          }
        }
        const loaded = data.messages ?? [];
        setMessages(loaded);
        const artifact = latestCodeWorkspaceArtifact(loaded);
        setCodeWorkspaceArtifact(artifact);
        if (!artifact) setInterfaceMode(CHAT_INTERFACE_MODE);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") toast.error(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeConversationId, resetInterfaceMode, setCodeWorkspaceArtifact, setConversations, setInterfaceMode, setSelectedAgentId, setMessages]);

  return {
    ...stream,
    activeVersion,
    setActiveVersion,
    loadingMessages,
    quota,
    canChat,
    conversationIsOwner,
    conversationReadOnly: Boolean(activeConversationId && !conversationCanContinue),
    latestTodoList,
    conversationImpact,
  };
}
