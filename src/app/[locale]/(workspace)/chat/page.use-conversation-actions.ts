"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { toast } from "sonner";

import type { QueuedChatMessage } from "@/components/chat/chat-composer";
import { removeChatComposerDraft } from "@/components/chat/chat-composer-draft";
import type { AgentVersion, ChatAttachment, ChatConversation, ChatConversationFolder, ChatMessage, CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import { fetchJson } from "@/lib/api-client";

type DeleteTarget = { kind: "conversation" | "folder"; id: string; name: string } | null;
type Setter<T> = Dispatch<SetStateAction<T>>;

type ConversationActionsContext = {
  workspaceId: string | null | undefined;
  selectedAgentId: string | null;
  activeConversationId: string | null;
  conversations: ChatConversation[];
  conversationFolders: ChatConversationFolder[];
  newConversationAgentIdRef: MutableRefObject<string | null>;
  composerDraftScopeRef: MutableRefObject<{ workspaceId: string; agentId: string; conversationId: string | null } | null>;
  setSelectedAgentId: Setter<string | null>;
  setActiveConversationId: Setter<string | null>;
  setActiveVersion: Setter<AgentVersion | null>;
  setQueuedMessages: Setter<QueuedChatMessage[]>;
  setMessages: (messages: ChatMessage[]) => void;
  setCodeWorkspaceArtifact: Setter<CodeWorkspaceArtifact | null>;
  setAttachments: Setter<ChatAttachment[]>;
  setConversations: Setter<ChatConversation[]>;
  setConversationFolders: Setter<ChatConversationFolder[]>;
  setPendingDelete: Setter<DeleteTarget>;
  setDeleting: Setter<boolean>;
  detachActiveStream: () => void;
  restoreComposerDraft: (agentId: string, conversationId: string | null) => void;
  resetInterfaceMode: () => void;
  refreshConversations: () => Promise<void>;
  t: (key: string) => string;
};

export function useConversationActions(context: ConversationActionsContext) {
  const c = context;
  function selectAgent(agentId: string) {
    if (agentId === c.selectedAgentId) return;
    c.setQueuedMessages([]);
    c.setSelectedAgentId(agentId);
    c.setActiveVersion(null);
    const params = new URLSearchParams({ agentId });
    if (c.activeConversationId) params.set("conversationId", c.activeConversationId);
    else {
      c.newConversationAgentIdRef.current = agentId;
      c.restoreComposerDraft(agentId, null);
      c.setMessages([]);
      c.setCodeWorkspaceArtifact(null);
      c.resetInterfaceMode();
    }
    window.history.replaceState(null, "", `/chat?${params.toString()}`);
  }

  function selectConversation(conversationId: string, conversationAgentId?: string | null) {
    if (conversationId === c.activeConversationId) return;
    c.detachActiveStream();
    c.setQueuedMessages([]);
    c.setMessages([]);
    c.setCodeWorkspaceArtifact(null);
    c.setAttachments([]);
    c.resetInterfaceMode();
    const nextAgentId = c.conversations.find((item) => item.id === conversationId)?.agentId ?? conversationAgentId;
    c.restoreComposerDraft(nextAgentId ?? c.selectedAgentId ?? "", conversationId);
    if (nextAgentId) c.setSelectedAgentId(nextAgentId);
    c.setActiveConversationId(conversationId);
    const params = new URLSearchParams();
    if (nextAgentId) params.set("agentId", nextAgentId);
    params.set("conversationId", conversationId);
    window.history.replaceState(null, "", `/chat?${params.toString()}`);
  }

  function startNewConversation() {
    const nextAgentId = c.newConversationAgentIdRef.current ?? c.selectedAgentId;
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
    window.history.replaceState(null, "", nextAgentId ? `/chat?agentId=${nextAgentId}` : "/chat");
  }

  async function renameConversation(conversationId: string, title: string) {
    const data = await fetchJson<{ conversation: ChatConversation }>(`/api/workspace/conversations/${conversationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    c.setConversations((current) => current.map((conversation) => (conversation.id === conversationId ? { ...conversation, title: data.conversation.title, updatedAt: data.conversation.updatedAt } : conversation)));
  }

  async function deleteConversation(conversationId: string) {
    c.setDeleting(true);
    try {
      await fetchJson(`/api/workspace/conversations/${conversationId}`, { method: "DELETE" });
      if (c.workspaceId && c.selectedAgentId) removeChatComposerDraft(c.workspaceId, c.selectedAgentId, conversationId);
      c.setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      c.setPendingDelete(null);
      if (c.activeConversationId === conversationId) {
        c.detachActiveStream();
        c.setQueuedMessages([]);
        c.setActiveConversationId(null);
        c.setMessages([]);
        c.setCodeWorkspaceArtifact(null);
        if (c.workspaceId && c.selectedAgentId) {
          const nextAgentId = c.newConversationAgentIdRef.current ?? c.selectedAgentId;
          c.composerDraftScopeRef.current = null;
          if (nextAgentId !== c.selectedAgentId) {
            c.setSelectedAgentId(nextAgentId);
            c.setActiveVersion(null);
          }
          c.restoreComposerDraft(nextAgentId, null);
        }
        c.resetInterfaceMode();
        window.history.replaceState(null, "", c.selectedAgentId ? `/chat?agentId=${c.selectedAgentId}` : "/chat");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : c.t("errors.deleteConversationFailed"));
    } finally {
      c.setDeleting(false);
    }
  }

  function requestConversationDelete(conversationId: string) {
    const conversation = c.conversations.find((item) => item.id === conversationId);
    if (conversation) c.setPendingDelete({ kind: "conversation", id: conversation.id, name: conversation.title });
  }
  async function createConversationFolder(name: string) {
    if (!c.workspaceId) return;
    try {
      const data = await fetchJson<{ folder: ChatConversationFolder }>("/api/workspace/conversation-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: c.workspaceId, name }) });
      c.setConversationFolders((current) => [...current, data.folder]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : c.t("errors.createFolderFailed"));
    }
  }
  async function renameConversationFolder(folderId: string, name: string) {
    try {
      const data = await fetchJson<{ folder: ChatConversationFolder }>(`/api/workspace/conversation-folders/${folderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      c.setConversationFolders((current) => current.map((folder) => (folder.id === folderId ? data.folder : folder)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : c.t("errors.renameFolderFailed"));
    }
  }
  async function deleteConversationFolder(folderId: string) {
    c.setDeleting(true);
    try {
      await fetchJson(`/api/workspace/conversation-folders/${folderId}`, { method: "DELETE" });
      c.setConversationFolders((current) => current.filter((folder) => folder.id !== folderId));
      c.setConversations((current) => current.map((conversation) => (conversation.folderId === folderId ? { ...conversation, folderId: null } : conversation)));
      c.setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : c.t("errors.deleteFolderFailed"));
    } finally {
      c.setDeleting(false);
    }
  }
  function requestFolderDelete(folderId: string) {
    const folder = c.conversationFolders.find((item) => item.id === folderId);
    if (folder) c.setPendingDelete({ kind: "folder", id: folder.id, name: folder.name });
  }
  async function toggleConversationPin(conversationId: string, isPinned: boolean) {
    try {
      const data = await fetchJson<{ conversation: ChatConversation }>(`/api/workspace/conversations/${conversationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: isPinned }) });
      c.setConversations((current) => current.map((conversation) => (conversation.id === conversationId ? { ...conversation, ...data.conversation } : conversation)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : c.t("errors.updatePinFailed"));
    }
  }
  async function reorderConversations(input: { conversationIds: string[]; folderId: string | null; pinned?: boolean }) {
    if (!c.workspaceId) return;
    const now = new Date().toISOString();
    c.setConversations((current) => current.map((conversation) => {
      const index = input.conversationIds.indexOf(conversation.id);
      return index === -1 ? conversation : { ...conversation, folderId: input.folderId, pinnedAt: input.pinned === undefined ? conversation.pinnedAt : input.pinned ? (conversation.pinnedAt ?? now) : null, sidebarOrder: (index + 1) * 1000 };
    }));
    try {
      await fetchJson("/api/workspace/conversations/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: c.workspaceId, ...input }) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : c.t("errors.moveFailed"));
      await c.refreshConversations();
    }
  }
  return { selectAgent, selectConversation, startNewConversation, renameConversation, deleteConversation, requestConversationDelete, createConversationFolder, renameConversationFolder, deleteConversationFolder, requestFolderDelete, toggleConversationPin, reorderConversations };
}
