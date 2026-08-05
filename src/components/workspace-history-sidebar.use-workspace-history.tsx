"use client";

import { useTranslations } from "next-intl";
import { useEffect,useState } from "react";
import { toast } from "sonner";

import type { ChatAgent,ChatConversation,ChatConversationFolder } from "@/components/chat/chat-types";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { AgentPayload,ConversationPayload,normalizeConversations } from "./workspace-history-sidebar.conversation-payload";

export function useWorkspaceHistory() {
  const { workspaceId } = useWorkspace();
  const tErrors = useTranslations("chat.errors");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [folders, setFolders] = useState<ChatConversationFolder[]>([]);
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatConversation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({
      workspaceId,
      limit: "50",
      includeMeta: "true",
    });
    const agentParams = new URLSearchParams({
      workspaceId,
      includeModelMeta: "true",
    });

    void Promise.all([fetchJson<ConversationPayload>(`/api/workspace/conversations?${params.toString()}`, { signal: controller.signal }), fetchJson<AgentPayload>(`/api/workspace/agents?${agentParams.toString()}`, { signal: controller.signal })])
      .then(([conversationPayload, agentPayload]) => {
        if (!active) return;
        const normalized = normalizeConversations(conversationPayload);
        setConversations(normalized.conversations);
        setFolders(normalized.folders);
        setAgents(Array.isArray(agentPayload) ? agentPayload : (agentPayload.agents ?? []));
        setResolvedWorkspaceId(workspaceId);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (active) {
          setLoadError(true);
          setResolvedWorkspaceId(workspaceId);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [revision, workspaceId]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!workspaceId || !normalizedQuery) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({
        workspaceId,
        limit: "50",
        includeMeta: "true",
        q: normalizedQuery,
      });
      setSearching(true);
      setSearchError(false);
      void fetchJson<ConversationPayload>(`/api/workspace/conversations?${params.toString()}`, { signal: controller.signal })
        .then((payload) => {
          if (!active) return;
          setSearchResults(normalizeConversations(payload).conversations);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          if (active) setSearchError(true);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 240);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, revision, workspaceId]);

  async function renameConversation(conversationId: string, title: string) {
    try {
      const data = await fetchJson<{ conversation: ChatConversation }>(`/api/workspace/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const applyRename = (current: ChatConversation[]) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                title: data.conversation.title,
                updatedAt: data.conversation.updatedAt,
              }
            : conversation,
        );
      setConversations(applyRename);
      setSearchResults(applyRename);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tErrors("renameConversationFailed"));
    }
  }

  async function deleteConversation(conversationId: string) {
    try {
      await fetchJson(`/api/workspace/conversations/${conversationId}`, {
        method: "DELETE",
      });
      const removeConversation = (current: ChatConversation[]) => current.filter((conversation) => conversation.id !== conversationId);
      setConversations(removeConversation);
      setSearchResults(removeConversation);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tErrors("deleteConversationFailed"));
      return false;
    }
  }

  async function createFolder(name: string) {
    if (!workspaceId) return;
    try {
      const data = await fetchJson<{ folder: ChatConversationFolder }>("/api/workspace/conversation-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, name }),
      });
      setFolders((current) => [...current, data.folder]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tErrors("createFolderFailed"));
    }
  }

  async function renameFolder(folderId: string, name: string) {
    try {
      const data = await fetchJson<{ folder: ChatConversationFolder }>(`/api/workspace/conversation-folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setFolders((current) => current.map((folder) => (folder.id === folderId ? data.folder : folder)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tErrors("renameFolderFailed"));
    }
  }

  async function deleteFolder(folderId: string) {
    try {
      await fetchJson(`/api/workspace/conversation-folders/${folderId}`, {
        method: "DELETE",
      });
      setFolders((current) => current.filter((folder) => folder.id !== folderId));
      setConversations((current) => current.map((conversation) => (conversation.folderId === folderId ? { ...conversation, folderId: null } : conversation)));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tErrors("deleteFolderFailed"));
      return false;
    }
  }

  async function togglePin(conversationId: string, pinned: boolean) {
    try {
      const data = await fetchJson<{ conversation: ChatConversation }>(`/api/workspace/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      const applyPin = (current: ChatConversation[]) => current.map((conversation) => (conversation.id === conversationId ? { ...conversation, ...data.conversation } : conversation));
      setConversations(applyPin);
      setSearchResults(applyPin);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tErrors("updatePinFailed"));
    }
  }

  async function reorderConversations(input: { conversationIds: string[]; folderId: string | null; pinned?: boolean }) {
    if (!workspaceId) return;
    const now = new Date().toISOString();
    setConversations((current) =>
      current.map((conversation) => {
        const index = input.conversationIds.indexOf(conversation.id);
        if (index === -1) return conversation;
        return {
          ...conversation,
          folderId: input.folderId,
          pinnedAt: input.pinned === undefined ? conversation.pinnedAt : input.pinned ? (conversation.pinnedAt ?? now) : null,
          sidebarOrder: (index + 1) * 1000,
        };
      }),
    );
    try {
      await fetchJson("/api/workspace/conversations/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...input }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tErrors("moveFailed"));
      setRevision((current) => current + 1);
    }
  }

  return {
    agents,
    conversations,
    folders,
    loading: loading || resolvedWorkspaceId !== workspaceId,
    loadError,
    query,
    searchResults: query.trim() ? searchResults : [],
    searching: Boolean(query.trim()) && searching,
    searchError: Boolean(query.trim()) && searchError,
    setQuery: (nextQuery: string) => {
      setQuery(nextQuery);
      setSearchResults([]);
      setSearching(false);
      setSearchError(false);
    },
    retry: () => {
      setLoading(true);
      setLoadError(false);
      setResolvedWorkspaceId(null);
      setSearchError(false);
      setRevision((current) => current + 1);
    },
    renameConversation,
    deleteConversation,
    createFolder,
    renameFolder,
    deleteFolder,
    togglePin,
    reorderConversations,
  };
}
