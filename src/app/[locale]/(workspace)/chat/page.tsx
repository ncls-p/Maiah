"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { toast } from "sonner";

import {
  ChatComposer,
  type QueuedChatMessage,
} from "@/components/chat/chat-composer";
import { ChatLayout } from "@/components/chat/chat-layout";
import { DestructiveConfirmationDialog } from "@/components/destructive-confirmation-dialog";
import {
  CODE_WORKSPACE_ARTIFACT_EVENT,
  ChatMessageList,
  CodeWorkspaceArtifactCard,
} from "@/components/chat/chat-message-list";
import { textFromMessage } from "@/components/chat/chat-types";
import { CodeWorkspaceResizeHandle } from "@/components/chat/code-workspace-artifact-card";
import {
  CODE_WORKSPACE_CHAT_WIDTH_STORAGE_KEY,
  DEFAULT_CHAT_WIDTH,
  MAX_CHAT_WIDTH,
  MIN_CHAT_WIDTH,
  normalizeCodeWorkspaceChatWidth,
} from "@/components/chat/code-workspace-layout";
import type {
  AgentVersion,
  ChatAgent,
  ChatConversation,
  ChatConversationFolder,
  ChatAttachment,
  ChatMessage,
  CodeWorkspaceArtifact,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import {
  CONVERSATION_PAGE_SIZE,
  ChatContextBar,
  conversationTitleFromFirstMessage,
  createQueuedMessage,
  latestCodeWorkspaceArtifact,
  mergeConversationPages,
  normalizeConversationList,
  rotatePromptSuggestions,
  type ConversationListPayload,
  uploadPathForFile,
  upsertConversation,
} from "./chat-page-helpers";
import {
  CHAT_INTERFACE_MODE,
  CODING_INTERFACE_MODE,
  shouldAutoActivateCoding,
  type InterfaceMode,
} from "./chat-interface-mode";
import {
  ChatPageLoading,
  CodeWorkspaceModeBar,
  EmptyConversationState,
  NoAssistantsState,
} from "./chat-page-view";

type AgentDirectoryPayload = {
  agents?: ChatAgent[];
  organizationDefaultAgentId?: string | null;
  userDefaultAgentId?: string | null;
  effectiveDefaultAgentId?: string | null;
  canCreateAgent?: boolean;
  canManageProviders?: boolean;
};

export default function ChatPage() {
  const t = useTranslations(CHAT_INTERFACE_MODE);
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [organizationDefaultAgentId, setOrganizationDefaultAgentId] = useState<
    string | null
  >(null);
  const [canCreateAgent, setCanCreateAgent] = useState(false);
  const [canRunSetup, setCanRunSetup] = useState(false);
  const [userDefaultAgentId, setUserDefaultAgentId] = useState<string | null>(
    null,
  );
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [latestConversationId, setLatestConversationId] = useState<
    string | null
  >(null);
  const [latestConversationAgentId, setLatestConversationAgentId] = useState<
    string | null
  >(null);
  const [conversationFolders, setConversationFolders] = useState<
    ChatConversationFolder[]
  >([]);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [conversationCursor, setConversationCursor] = useState<string | null>(
    null,
  );
  const [loadingMoreConversations, setLoadingMoreConversations] =
    useState(false);
  const [activeVersion, setActiveVersion] = useState<AgentVersion | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(
    null,
  );
  const [codeWorkspaceArtifact, setCodeWorkspaceArtifact] =
    useState<CodeWorkspaceArtifact | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [interfaceMode, setInterfaceMode] =
    useState<InterfaceMode>(CHAT_INTERFACE_MODE);
  const [codingChatWidth, setCodingChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "conversation"; id: string; name: string }
    | { kind: "folder"; id: string; name: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const skipNextMessageLoadRef = useRef(false);
  const processingQueuedMessageRef = useRef(false);
  const lastAutoOpenedWorkspaceRef = useRef<string | null>(null);
  const userSelectedInterfaceModeRef = useRef<InterfaceMode | null>(null);

  function chooseInterfaceMode(mode: InterfaceMode) {
    userSelectedInterfaceModeRef.current = mode;
    setInterfaceMode(mode);
  }

  function resetInterfaceMode() {
    userSelectedInterfaceModeRef.current = null;
    setInterfaceMode(CHAT_INTERFACE_MODE);
  }

  function updateCodingChatWidth(width: number) {
    const nextWidth = normalizeCodeWorkspaceChatWidth(width);
    setCodingChatWidth(nextWidth);
    try {
      window.localStorage.setItem(
        CODE_WORKSPACE_CHAT_WIDTH_STORAGE_KEY,
        JSON.stringify(nextWidth),
      );
    } catch {
      // Keep the resized width for this session when storage is unavailable.
    }
  }

  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(
        CODE_WORKSPACE_CHAT_WIDTH_STORAGE_KEY,
      );
      if (!persisted) return;
      const nextWidth = normalizeCodeWorkspaceChatWidth(JSON.parse(persisted));
      queueMicrotask(() => setCodingChatWidth(nextWidth));
    } catch {
      // Ignore malformed or unavailable local storage and keep the default.
    }
  }, []);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const canChat = Boolean(activeVersion?.providerId && activeVersion?.modelId);
  const emptyPromptSuggestions = useMemo(
    () =>
      selectedAgent
        ? rotatePromptSuggestions(
            selectedAgent.promptSuggestions ?? [],
            `${selectedAgent.id}-${new Date().toISOString().slice(0, 10)}`,
          )
        : [],
    [selectedAgent],
  );

  useEffect(() => {
    function handleCodeWorkspaceArtifact(event: Event) {
      const detail = (
        event as CustomEvent<{
          artifact?: CodeWorkspaceArtifact;
          activate?: boolean;
        }>
      ).detail;
      const artifact = detail?.artifact;
      if (!artifact?.projectId) return;
      setCodeWorkspaceArtifact((current) => {
        if (
          current?.projectId === artifact.projectId &&
          artifact.version <= current.version
        ) {
          return current;
        }
        return artifact;
      });
      if (!detail.activate) return;
      const artifactKey = `${artifact.projectId}:${artifact.version}`;
      if (lastAutoOpenedWorkspaceRef.current === artifactKey) return;
      lastAutoOpenedWorkspaceRef.current = artifactKey;
      userSelectedInterfaceModeRef.current = CODING_INTERFACE_MODE;
      setInterfaceMode(CODING_INTERFACE_MODE);
    }
    window.addEventListener(
      CODE_WORKSPACE_ARTIFACT_EVENT,
      handleCodeWorkspaceArtifact,
    );
    return () => {
      window.removeEventListener(
        CODE_WORKSPACE_ARTIFACT_EVENT,
        handleCodeWorkspaceArtifact,
      );
    };
  }, []);

  const fetchConversationPage = useCallback(
    async ({
      before,
      signal,
    }: {
      before?: string | null;
      signal?: AbortSignal;
    } = {}) => {
      if (!workspaceId) {
        return {
          conversations: [],
          folders: [],
          latestConversationId: null,
          latestConversationAgentId: null,
          hasMore: false,
          nextCursor: null,
        };
      }
      const params = new URLSearchParams({
        workspaceId,
        limit: String(CONVERSATION_PAGE_SIZE),
        includeMeta: "true",
      });
      if (before) params.set("before", before);
      const data = await fetchJson<ConversationListPayload>(
        `/api/workspace/conversations?${params.toString()}`,
        { signal },
      );
      return normalizeConversationList(data);
    },
    [workspaceId],
  );

  const loadAgentDirectory = useCallback(
    async ({
      preferredAgentId,
      signal,
    }: {
      preferredAgentId?: string | null;
      signal?: AbortSignal;
    } = {}) => {
      if (!workspaceId) return null;

      const agentParams = new URLSearchParams({
        workspaceId,
        includeModelMeta: "true",
      });
      const response = await fetchJson<AgentDirectoryPayload | ChatAgent[]>(
        `/api/workspace/agents?${agentParams.toString()}`,
        { signal },
      );
      const data = (
        Array.isArray(response) ? response : (response.agents ?? [])
      ) as ChatAgent[];
      const responseDefaults = Array.isArray(response)
        ? {
            organizationDefaultAgentId: null,
            userDefaultAgentId: null,
            effectiveDefaultAgentId: null,
            canCreateAgent: false,
            canManageProviders: false,
          }
        : response;

      setAgents(data);
      setOrganizationDefaultAgentId(
        responseDefaults.organizationDefaultAgentId ?? null,
      );
      setCanCreateAgent(Boolean(responseDefaults.canCreateAgent));
      setCanRunSetup(
        Boolean(
          responseDefaults.canCreateAgent &&
          responseDefaults.canManageProviders,
        ),
      );
      setUserDefaultAgentId(responseDefaults.userDefaultAgentId ?? null);

      const params = new URL(window.location.href).searchParams;
      const requestedAgentId = params.get("agentId");
      const requestedConversationId = params.get("conversationId");
      const nextAgentId =
        (requestedAgentId && data.some((agent) => agent.id === requestedAgentId)
          ? requestedAgentId
          : null) ??
        (preferredAgentId && data.some((agent) => agent.id === preferredAgentId)
          ? preferredAgentId
          : null) ??
        (responseDefaults.effectiveDefaultAgentId &&
        data.some(
          (agent) => agent.id === responseDefaults.effectiveDefaultAgentId,
        )
          ? responseDefaults.effectiveDefaultAgentId
          : null) ??
        data[0]?.id ??
        null;

      setSelectedAgentId(nextAgentId);
      if (requestedConversationId) {
        setActiveConversationId(requestedConversationId);
      }
      return nextAgentId;
    },
    [workspaceId],
  );

  const refreshConversations = useCallback(async () => {
    const data = await fetchConversationPage();
    setConversations(data.conversations);
    setConversationFolders(data.folders);
    setLatestConversationId(data.latestConversationId);
    setLatestConversationAgentId(data.latestConversationAgentId);
    setHasMoreConversations(data.hasMore);
    setConversationCursor(data.nextCursor);
  }, [fetchConversationPage]);

  const loadMoreConversations = useCallback(async () => {
    if (loadingMoreConversations || !hasMoreConversations) return;
    const before = conversationCursor ?? conversations.at(-1)?.updatedAt;
    if (!before) return;
    setLoadingMoreConversations(true);
    try {
      const data = await fetchConversationPage({ before });
      setConversations((current) =>
        mergeConversationPages(current, data.conversations),
      );
      if (data.folders.length > 0) setConversationFolders(data.folders);
      setHasMoreConversations(data.hasMore);
      setConversationCursor(data.nextCursor);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errors.loadOlderFailed"),
      );
      return;
    } finally {
      setLoadingMoreConversations(false);
    }
  }, [
    conversationCursor,
    conversations,
    fetchConversationPage,
    hasMoreConversations,
    loadingMoreConversations,
    t,
  ]);

  const {
    messages,
    setMessages,
    sending,
    pendingApprovals,
    handleSubmit,
    resolveApproval,
    stopGeneration,
    detachActiveStream,
  } = useChatStream({
    agentId: selectedAgentId,
    conversationId: activeConversationId,
    workspaceId,
    canChat,
    onConversationCreated: (conversationId, firstMessage) => {
      skipNextMessageLoadRef.current = true;
      setActiveConversationId(conversationId);
      setLatestConversationId(conversationId);
      setLatestConversationAgentId(selectedAgentId);
      if (selectedAgentId) {
        const now = new Date().toISOString();
        setConversations((current) =>
          upsertConversation(current, {
            id: conversationId,
            title: conversationTitleFromFirstMessage(firstMessage),
            agentId: selectedAgentId,
            folderId: null,
            pinnedAt: null,
            sidebarOrder: null,
            updatedAt: now,
          }),
        );
      }
      const params = new URLSearchParams();
      if (selectedAgentId) params.set("agentId", selectedAgentId);
      params.set("conversationId", conversationId);
      window.history.replaceState(null, "", `/chat?${params.toString()}`);
    },
    onConversationTitle: (conversationId, title) => {
      setConversations((current) => {
        let found = false;
        const next = current.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          found = true;
          return { ...conversation, title };
        });
        if (found || !selectedAgentId) return next;
        return [
          {
            id: conversationId,
            title,
            agentId: selectedAgentId,
            updatedAt: new Date().toISOString(),
          },
          ...next,
        ];
      });
    },
    onConversationsRefresh: refreshConversations,
  });

  useEffect(() => {
    const latestArtifact = latestCodeWorkspaceArtifact(messages);
    if (!latestArtifact) return;
    queueMicrotask(() => {
      setCodeWorkspaceArtifact((current) => {
        if (
          current?.projectId === latestArtifact.projectId &&
          latestArtifact.version <= current.version
        ) {
          return current;
        }
        return latestArtifact;
      });
      if (!sending) return;
      if (!shouldAutoActivateCoding(userSelectedInterfaceModeRef.current)) {
        return;
      }
      const artifactKey = `${latestArtifact.projectId}:${latestArtifact.version}`;
      if (lastAutoOpenedWorkspaceRef.current === artifactKey) return;
      lastAutoOpenedWorkspaceRef.current = artifactKey;
      setInterfaceMode(CODING_INTERFACE_MODE);
    });
  }, [messages, sending]);

  useEffect(() => {
    if (
      sending ||
      !canChat ||
      queuedMessages.length === 0 ||
      processingQueuedMessageRef.current
    ) {
      return;
    }

    const nextMessage = queuedMessages[0];
    if (!nextMessage?.content.trim()) {
      queueMicrotask(() => {
        setQueuedMessages((current) => current.slice(1));
      });
      return;
    }

    processingQueuedMessageRef.current = true;
    queueMicrotask(() => {
      setQueuedMessages((current) =>
        current[0]?.id === nextMessage.id
          ? current.slice(1)
          : current.filter((message) => message.id !== nextMessage.id),
      );
      void handleSubmit(nextMessage.content.trim(), {
        codeWorkspaceId:
          interfaceMode === CODING_INTERFACE_MODE
            ? codeWorkspaceArtifact?.projectId
            : undefined,
      }).finally(() => {
        processingQueuedMessageRef.current = false;
      });
    });
  }, [
    canChat,
    codeWorkspaceArtifact,
    handleSubmit,
    interfaceMode,
    queuedMessages,
    sending,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const controller = new AbortController();

    async function loadAgents() {
      try {
        await loadAgentDirectory({ signal: controller.signal });
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error(err.message);
        }
        return;
      } finally {
        if (!cancelled) setLoadingAgents(false);
      }
    }

    void loadAgents();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loadAgentDirectory, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(() => setLoadingContext(true));

    async function loadConversations() {
      try {
        const conversationData = await fetchConversationPage({
          signal: controller.signal,
        });
        if (cancelled) return;
        setConversations(conversationData.conversations);
        setConversationFolders(conversationData.folders);
        setLatestConversationId(conversationData.latestConversationId);
        setLatestConversationAgentId(
          conversationData.latestConversationAgentId,
        );
        setHasMoreConversations(conversationData.hasMore);
        setConversationCursor(conversationData.nextCursor);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error(err.message);
        }
        return;
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }

    void loadConversations();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fetchConversationPage, workspaceId]);

  useEffect(() => {
    if (!selectedAgentId || !workspaceId) return;
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(() => setLoadingContext(true));

    async function loadActiveVersion() {
      try {
        const versionData = await fetchJson<AgentVersion[]>(
          `/api/workspace/agents/${selectedAgentId}/versions?workspaceId=${workspaceId}`,
          { signal: controller.signal },
        );
        if (cancelled) return;
        setActiveVersion(
          versionData.find((version) => version.isActive) ?? null,
        );
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error(err.message);
        }
        return;
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }

    void loadActiveVersion();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedAgentId, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    async function loadQuota() {
      try {
        const data = await fetchJson<{
          quota: { used: number; limit: number } | null;
        }>(`/api/workspace/usage?workspaceId=${workspaceId}&limit=1`);
        if (!cancelled && data.quota) setQuota(data.quota);
      } catch {
        if (!cancelled) setQuota(null);
      }
    }
    void loadQuota();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!activeConversationId) {
      skipNextMessageLoadRef.current = false;
      queueMicrotask(() => {
        setMessages([]);
        setCodeWorkspaceArtifact(null);
        setAttachments([]);
        resetInterfaceMode();
      });
      return;
    }
    if (skipNextMessageLoadRef.current) {
      skipNextMessageLoadRef.current = false;
      setLoadingMessages(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(() => setLoadingMessages(true));

    async function loadMessages() {
      try {
        const data = await fetchJson<{
          conversation?: ChatConversation;
          messages?: ChatMessage[];
        }>(`/api/workspace/conversations/${activeConversationId}`, {
          signal: controller.signal,
        });
        if (cancelled) return;
        const urlAgentId = new URL(window.location.href).searchParams.get(
          "agentId",
        );
        if (data.conversation?.agentId && !urlAgentId) {
          setSelectedAgentId(data.conversation.agentId);
        }
        const loadedConversation = data.conversation;
        if (loadedConversation) {
          setConversations((current) =>
            upsertConversation(current, loadedConversation),
          );
        }
        const loadedMessages = data.messages ?? [];
        setMessages(loadedMessages);
        const latestArtifact = latestCodeWorkspaceArtifact(loadedMessages);
        setCodeWorkspaceArtifact(latestArtifact);
        if (!latestArtifact) setInterfaceMode(CHAT_INTERFACE_MODE);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error(err.message);
        }
        return;
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    }

    void loadMessages();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeConversationId, setMessages]);

  function selectAgent(agentId: string) {
    if (agentId === selectedAgentId) return;
    setQueuedMessages([]);
    setSelectedAgentId(agentId);
    setActiveVersion(null);
    const params = new URLSearchParams({ agentId });
    if (activeConversationId) {
      params.set("conversationId", activeConversationId);
    } else {
      setMessages([]);
      setCodeWorkspaceArtifact(null);
      setAttachments([]);
      resetInterfaceMode();
    }
    window.history.replaceState(null, "", `/chat?${params.toString()}`);
  }

  function selectConversation(
    conversationId: string,
    conversationAgentId?: string | null,
  ) {
    if (conversationId === activeConversationId) return;
    detachActiveStream();
    setQueuedMessages([]);
    setMessages([]);
    setCodeWorkspaceArtifact(null);
    setAttachments([]);
    resetInterfaceMode();
    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );
    const nextAgentId = conversation?.agentId ?? conversationAgentId;
    if (nextAgentId) setSelectedAgentId(nextAgentId);
    setActiveConversationId(conversationId);
    const params = new URLSearchParams();
    if (nextAgentId) params.set("agentId", nextAgentId);
    params.set("conversationId", conversationId);
    window.history.replaceState(null, "", `/chat?${params.toString()}`);
  }

  function startNewConversation() {
    detachActiveStream();
    setQueuedMessages([]);
    setActiveConversationId(null);
    setMessages([]);
    setCodeWorkspaceArtifact(null);
    setAttachments([]);
    resetInterfaceMode();
    window.history.replaceState(
      null,
      "",
      selectedAgentId ? `/chat?agentId=${selectedAgentId}` : "/chat",
    );
  }

  async function renameConversation(conversationId: string, title: string) {
    const data = await fetchJson<{ conversation: ChatConversation }>(
      `/api/workspace/conversations/${conversationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title: data.conversation.title,
              updatedAt: data.conversation.updatedAt,
            }
          : conversation,
      ),
    );
  }

  async function deleteConversation(conversationId: string) {
    setDeleting(true);
    try {
      await fetchJson(`/api/workspace/conversations/${conversationId}`, {
        method: "DELETE",
      });
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId),
      );
      setPendingDelete(null);
      if (activeConversationId === conversationId) {
        detachActiveStream();
        setQueuedMessages([]);
        setActiveConversationId(null);
        setMessages([]);
        setCodeWorkspaceArtifact(null);
        setAttachments([]);
        resetInterfaceMode();
        window.history.replaceState(
          null,
          "",
          selectedAgentId ? `/chat?agentId=${selectedAgentId}` : "/chat",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("errors.deleteConversationFailed"),
      );
      return;
    } finally {
      setDeleting(false);
    }
  }

  function requestConversationDelete(conversationId: string) {
    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );
    if (conversation) {
      setPendingDelete({
        kind: "conversation",
        id: conversation.id,
        name: conversation.title,
      });
    }
  }

  async function createConversationFolder(name: string) {
    if (!workspaceId) return;
    try {
      const data = await fetchJson<{ folder: ChatConversationFolder }>(
        "/api/workspace/conversation-folders",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, name }),
        },
      );
      setConversationFolders((current) => [...current, data.folder]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errors.createFolderFailed"),
      );
      return;
    }
  }

  async function renameConversationFolder(folderId: string, name: string) {
    try {
      const data = await fetchJson<{ folder: ChatConversationFolder }>(
        `/api/workspace/conversation-folders/${folderId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      setConversationFolders((current) =>
        current.map((folder) =>
          folder.id === folderId ? data.folder : folder,
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errors.renameFolderFailed"),
      );
      return;
    }
  }

  async function deleteConversationFolder(folderId: string) {
    setDeleting(true);
    try {
      await fetchJson(`/api/workspace/conversation-folders/${folderId}`, {
        method: "DELETE",
      });
      setConversationFolders((current) =>
        current.filter((folder) => folder.id !== folderId),
      );
      setConversations((current) =>
        current.map((conversation) =>
          conversation.folderId === folderId
            ? { ...conversation, folderId: null }
            : conversation,
        ),
      );
      setPendingDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errors.deleteFolderFailed"),
      );
      return;
    } finally {
      setDeleting(false);
    }
  }

  function requestFolderDelete(folderId: string) {
    const folder = conversationFolders.find((item) => item.id === folderId);
    if (folder) {
      setPendingDelete({ kind: "folder", id: folder.id, name: folder.name });
    }
  }

  async function toggleConversationPin(
    conversationId: string,
    isPinned: boolean,
  ) {
    try {
      const data = await fetchJson<{ conversation: ChatConversation }>(
        `/api/workspace/conversations/${conversationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: isPinned }),
        },
      );
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, ...data.conversation }
            : conversation,
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errors.updatePinFailed"),
      );
      return;
    }
  }

  async function reorderConversations(input: {
    conversationIds: string[];
    folderId: string | null;
    pinned?: boolean;
  }) {
    if (!workspaceId) return;
    const now = new Date().toISOString();
    setConversations((current) =>
      current.map((conversation) => {
        const index = input.conversationIds.indexOf(conversation.id);
        if (index === -1) return conversation;
        return {
          ...conversation,
          folderId: input.folderId,
          pinnedAt:
            input.pinned === undefined
              ? conversation.pinnedAt
              : input.pinned
                ? (conversation.pinnedAt ?? now)
                : null,
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
      toast.error(
        error instanceof Error ? error.message : t("errors.moveFailed"),
      );
      await refreshConversations();
      return;
    }
  }

  function skipPendingSuggestions() {
    if (!activeConversationId) return;
    void fetch(
      `/api/workspace/conversations/${activeConversationId}/skip-suggestions`,
      { method: "POST" },
    ).catch(() => undefined);
  }

  function queueMessage(content: string) {
    skipPendingSuggestions();
    setQueuedMessages((current) => [...current, createQueuedMessage(content)]);
  }

  function submitMessage() {
    const hasAttachments = attachments.length > 0;
    const content =
      input.trim() ||
      (hasAttachments
        ? attachments.every((attachment) => attachment.kind === "chat_image")
          ? t("attachments.analyzeImage")
          : t("attachments.analyzeFile")
        : "");
    if (!content || !canChat) return;
    if (sending && attachments.length > 0) {
      toast.error(t("attachments.waitForResponse"));
      return;
    }
    const attachmentsToSend = attachments;
    setInput("");
    setAttachments([]);
    if (activeConversationId) setLatestConversationId(activeConversationId);
    if (activeConversationId) setLatestConversationAgentId(selectedAgentId);
    if (sending) {
      queueMessage(content);
      return;
    }
    void handleSubmit(content, {
      codeWorkspaceId:
        interfaceMode === CODING_INTERFACE_MODE
          ? codeWorkspaceArtifact?.projectId
          : undefined,
      attachments: attachmentsToSend,
    });
  }

  async function uploadCodeWorkspace(files: File[]) {
    if (!workspaceId || !canChat) return;
    const uploadedFiles = files.filter(Boolean);
    if (uploadedFiles.length === 0) return;
    const zipFiles = uploadedFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".zip"),
    );
    if (zipFiles.length > 0 && uploadedFiles.length > 1) {
      toast.error(t("attachments.singleCodeSource"));
      return;
    }
    if (
      zipFiles.length === 0 &&
      !uploadedFiles.some((file) => /\.html?$/i.test(uploadPathForFile(file)))
    ) {
      toast.error(t("attachments.htmlRequired"));
      return;
    }
    try {
      const formData = new FormData();
      formData.set("workspaceId", workspaceId);
      if (zipFiles.length === 1) {
        formData.set("file", zipFiles[0]);
      } else {
        for (const file of uploadedFiles) {
          formData.append("files", file, uploadPathForFile(file));
        }
      }
      const response = await fetch("/api/workspace/code-projects/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as {
        artifact?: CodeWorkspaceArtifact;
        prompt?: string;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error || t("attachments.codeUploadFailed"));
      }
      if (!data?.artifact) {
        throw new Error(data?.error || t("attachments.codeUploadFailed"));
      }
      if (!data.prompt) {
        throw new Error(data.error || t("attachments.codeUploadFailed"));
      }
      const { artifact: uploadedArtifact, prompt } = data;
      setAttachments([]);
      setCodeWorkspaceArtifact(uploadedArtifact);
      userSelectedInterfaceModeRef.current = CODING_INTERFACE_MODE;
      setInterfaceMode(CODING_INTERFACE_MODE);
      lastAutoOpenedWorkspaceRef.current = `${uploadedArtifact.projectId}:${uploadedArtifact.version}`;
      toast.success(t("attachments.codeUploaded"));
      await handleSubmit(prompt, { codeWorkspaceArtifact: uploadedArtifact });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("attachments.codeUploadFailed"),
      );
      return;
    }
  }

  async function uploadChatAttachment(file: File) {
    if (!workspaceId || !canChat) return;
    if (attachments.length >= 8) {
      toast.error(t("attachments.limit", { count: 8 }));
      return;
    }
    try {
      const formData = new FormData();
      formData.set("workspaceId", workspaceId);
      formData.set("file", file);
      const response = await fetch("/api/workspace/chat-attachments/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as {
        attachment?: ChatAttachment;
        error?: string;
      } | null;
      if (!response.ok || !data?.attachment) {
        throw new Error(data?.error || t("attachments.uploadFailed"));
      }
      setAttachments((current) => [...current, data.attachment!]);
      toast.success(
        data.attachment.kind === "chat_image"
          ? t("attachments.imageAttached")
          : t("attachments.fileAttached"),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("attachments.uploadFailed"),
      );
      return;
    }
  }

  function submitSuggestion(content: string) {
    const trimmedContent = content.trim();
    if (!trimmedContent || !canChat) return;
    setInput("");
    if (sending) {
      queueMessage(trimmedContent);
      return;
    }
    void handleSubmit(trimmedContent);
  }

  async function setUserDefaultAgent(agentId: string | null) {
    if (!workspaceId) return;
    try {
      const res = await fetch("/api/workspace/agents/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          scope: "user",
          defaultAgentId: agentId,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || t("defaultSaveFailed"));
      }
      const data = (await res.json()) as {
        organizationDefaultAgentId: string | null;
        userDefaultAgentId: string | null;
      };
      setOrganizationDefaultAgentId(data.organizationDefaultAgentId ?? null);
      setUserDefaultAgentId(data.userDefaultAgentId ?? null);
      toast.success(t("defaultSaved"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("defaultSaveFailed"),
      );
      return;
    }
  }

  function updateQueuedMessage(id: string, content: string) {
    setQueuedMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content } : message,
      ),
    );
  }

  function cancelQueuedMessage(id: string) {
    setQueuedMessages((current) =>
      current.filter((message) => message.id !== id),
    );
  }

  async function editMessage(message: ChatMessage, content: string) {
    if (!activeConversationId) return;
    const trimmedContent = content.trim();
    await fetchJson(
      `/api/workspace/conversations/${activeConversationId}/messages/${message.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmedContent }),
      },
    );
    setMessages(
      messages.map((item) =>
        item.id === message.id
          ? {
              ...item,
              status: "completed",
              parts: [
                { type: "text", content: trimmedContent },
                ...item.parts.filter((part) => part.type === "file"),
              ],
            }
          : item,
      ),
    );
    if (message.role !== "user" || !trimmedContent || sending) return;
    await handleSubmit(trimmedContent, {
      resendFromMessageId: message.id,
      reuseUserMessage: true,
    });
  }

  async function deleteMessage(message: ChatMessage) {
    if (!activeConversationId) return;
    await fetchJson(
      `/api/workspace/conversations/${activeConversationId}/messages/${message.id}`,
      { method: "DELETE" },
    );
    setMessages(messages.filter((item) => item.id !== message.id));
    await refreshConversations();
  }

  async function resendMessage(message: ChatMessage) {
    if (!activeConversationId || sending) return;
    const content = textFromMessage(message).trim();
    if (!content) return;
    await handleSubmit(content, {
      resendFromMessageId: message.id,
      reuseUserMessage: true,
    });
  }

  async function reloadActualLatestMessages() {
    if (!activeConversationId || sending) return;
    const data = await fetchJson<{ messages?: ChatMessage[] }>(
      `/api/workspace/conversations/${activeConversationId}`,
    );
    const latestMessages = data.messages ?? [];
    setMessages(latestMessages);
    const latestArtifact = latestCodeWorkspaceArtifact(latestMessages);
    setCodeWorkspaceArtifact(latestArtifact);
  }

  async function reloadAgentContext() {
    if (!workspaceId) return;
    setLoadingContext(true);
    try {
      const refreshedAgentId = await loadAgentDirectory({
        preferredAgentId: selectedAgentId,
      });
      if (!refreshedAgentId) {
        setActiveVersion(null);
        return;
      }
      if (refreshedAgentId !== selectedAgentId) {
        setActiveVersion(null);
        return;
      }
      const versionData = await fetchJson<AgentVersion[]>(
        `/api/workspace/agents/${refreshedAgentId}/versions?workspaceId=${workspaceId}`,
      );
      setActiveVersion(versionData.find((version) => version.isActive) ?? null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errors.reloadAgentFailed"),
      );
      return;
    } finally {
      setLoadingContext(false);
    }
  }

  const approveToolInvocation = useCallback(
    (approval: PendingToolApproval) => {
      void resolveApproval("approve", approval.invocationId);
    },
    [resolveApproval],
  );
  const rejectToolInvocation = useCallback(
    (approval: PendingToolApproval) => {
      void resolveApproval("reject", approval.invocationId);
    },
    [resolveApproval],
  );

  const destructiveDialog = (
    <DestructiveConfirmationDialog
      open={pendingDelete !== null}
      title={
        pendingDelete?.kind === "folder"
          ? t("sidebar.deleteFolderTitle")
          : t("sidebar.deleteConversationTitle")
      }
      description={
        pendingDelete?.kind === "folder"
          ? t("sidebar.deleteFolderDescription", {
              name: pendingDelete?.name ?? "",
            })
          : t("sidebar.deleteConversationDescription", {
              name: pendingDelete?.name ?? "",
            })
      }
      cancelLabel={t("sidebar.deleteCancel")}
      confirmLabel={deleting ? t("sidebar.deleting") : t("sidebar.delete")}
      busy={deleting}
      onOpenChange={(open) => {
        if (!open && !deleting) setPendingDelete(null);
      }}
      onConfirm={() => {
        if (!pendingDelete) return;
        if (pendingDelete.kind === "folder") {
          void deleteConversationFolder(pendingDelete.id);
        } else {
          void deleteConversation(pendingDelete.id);
        }
      }}
    />
  );

  if (workspaceLoading || loadingAgents) {
    return <ChatPageLoading />;
  }

  if (agents.length === 0) {
    return (
      <>
        <ChatLayout
          agents={agents}
          conversations={conversations}
          conversationFolders={conversationFolders}
          selectedAgent={selectedAgent}
          selectedAgentId={selectedAgentId}
          activeConversationId={activeConversationId}
          organizationDefaultAgentId={organizationDefaultAgentId}
          userDefaultAgentId={userDefaultAgentId}
          canChat={canChat}
          canCreateAgent={canCreateAgent}
          canRunSetup={canRunSetup}
          loadingSidebar={loadingContext}
          hasMoreConversations={hasMoreConversations}
          loadingMoreConversations={loadingMoreConversations}
          onLoadMoreConversations={loadMoreConversations}
          onSelectAgent={selectAgent}
          onSelectConversation={selectConversation}
          onNewConversation={startNewConversation}
          onSetUserDefaultAgent={(agentId: string | null) =>
            void setUserDefaultAgent(agentId)
          }
          onRenameConversation={(conversationId, title) =>
            void renameConversation(conversationId, title)
          }
          onDeleteConversation={requestConversationDelete}
          onCreateConversationFolder={(name) =>
            void createConversationFolder(name)
          }
          onRenameConversationFolder={(folderId, name) =>
            void renameConversationFolder(folderId, name)
          }
          onDeleteConversationFolder={requestFolderDelete}
          onToggleConversationPin={(conversationId, pinned) =>
            void toggleConversationPin(conversationId, pinned)
          }
          onReorderConversations={(input) => void reorderConversations(input)}
          onSetupComplete={() => void reloadAgentContext()}
        >
          <NoAssistantsState
            canCreateAgent={canCreateAgent}
            canRunSetup={canRunSetup}
            t={t}
          />
        </ChatLayout>
        {destructiveDialog}
      </>
    );
  }

  return (
    <>
      <ChatLayout
        agents={agents}
        conversations={conversations}
        conversationFolders={conversationFolders}
        selectedAgent={selectedAgent}
        selectedAgentId={selectedAgentId}
        activeConversationId={activeConversationId}
        organizationDefaultAgentId={organizationDefaultAgentId}
        userDefaultAgentId={userDefaultAgentId}
        canChat={canChat}
        canCreateAgent={canCreateAgent}
        canRunSetup={canRunSetup}
        loadingSidebar={loadingContext}
        hasMoreConversations={hasMoreConversations}
        loadingMoreConversations={loadingMoreConversations}
        onLoadMoreConversations={loadMoreConversations}
        onSelectAgent={selectAgent}
        onSelectConversation={selectConversation}
        onNewConversation={startNewConversation}
        onSetUserDefaultAgent={(agentId: string | null) =>
          void setUserDefaultAgent(agentId)
        }
        onRenameConversation={(conversationId, title) =>
          void renameConversation(conversationId, title)
        }
        onDeleteConversation={requestConversationDelete}
        onCreateConversationFolder={(name) =>
          void createConversationFolder(name)
        }
        onRenameConversationFolder={(folderId, name) =>
          void renameConversationFolder(folderId, name)
        }
        onDeleteConversationFolder={requestFolderDelete}
        onToggleConversationPin={(conversationId, pinned) =>
          void toggleConversationPin(conversationId, pinned)
        }
        onReorderConversations={(input) => void reorderConversations(input)}
        onSetupComplete={() => void reloadAgentContext()}
      >
        <ChatContextBar quota={quota} />
        {codeWorkspaceArtifact ? (
          <CodeWorkspaceModeBar
            artifact={codeWorkspaceArtifact}
            interfaceMode={interfaceMode}
            onModeChange={chooseInterfaceMode}
          />
        ) : null}
        {interfaceMode === CODING_INTERFACE_MODE && codeWorkspaceArtifact ? (
          <section
            className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-background lg:[grid-template-columns:var(--coding-chat-width)_0.75rem_minmax(0,1fr)]"
            style={
              {
                "--coding-chat-width": `${codingChatWidth}px`,
              } as CSSProperties
            }
          >
            <aside
              className="flex min-h-0 flex-col bg-muted/10"
              id="coding-chat-panel"
            >
              <div className="border-b border-border/50 px-3 py-2">
                <p className="text-xs font-medium text-foreground">Chat</p>
                <p className="text-[11px] text-muted-foreground">
                  Demande des modifications pendant que tu codes.
                </p>
              </div>
              <section className="min-h-0 flex-1 overflow-hidden">
                <div className="size-full min-h-0">
                  <ChatMessageList
                    key={activeConversationId ?? "new-conversation"}
                    messages={messages}
                    sending={sending}
                    loading={loadingMessages}
                    workspaceId={workspaceId ?? undefined}
                    workspaceArtifactDisplay="summary"
                    conversationId={activeConversationId}
                    bottomRef={bottomRef}
                    onEditMessage={editMessage}
                    onDeleteMessage={deleteMessage}
                    onResendMessage={resendMessage}
                    onRegenerateAssistant={resendMessage}
                    onJumpLatest={reloadActualLatestMessages}
                    pendingApprovals={pendingApprovals}
                    onApproveTool={approveToolInvocation}
                    onRejectTool={rejectToolInvocation}
                    onSuggestionClick={submitSuggestion}
                  />
                </div>
              </section>
              <ChatComposer
                input={input}
                canChat={canChat}
                sending={sending}
                queuedMessages={queuedMessages}
                onInputChange={setInput}
                onSubmit={submitMessage}
                onStop={stopGeneration}
                onQueuedMessageChange={updateQueuedMessage}
                onQueuedMessageCancel={cancelQueuedMessage}
                onUploadCodeWorkspace={uploadCodeWorkspace}
                onUploadChatAttachment={uploadChatAttachment}
                attachments={attachments}
                onRemoveAttachment={(attachmentId) =>
                  setAttachments((current) =>
                    current.filter(
                      (attachment) => attachment.id !== attachmentId,
                    ),
                  )
                }
              />
            </aside>
            <CodeWorkspaceResizeHandle
              controls="coding-chat-panel"
              label={t("resizeCodingChat")}
              maximum={MAX_CHAT_WIDTH}
              minimum={MIN_CHAT_WIDTH}
              onResize={updateCodingChatWidth}
              value={codingChatWidth}
            />
            <div className="min-h-0 overflow-hidden">
              <CodeWorkspaceArtifactCard
                artifact={codeWorkspaceArtifact}
                workspaceId={workspaceId ?? undefined}
                variant="workbench"
              />
            </div>
          </section>
        ) : (
          <section className="min-h-0 flex-1 overflow-hidden">
            {!loadingMessages && messages.length === 0 ? (
              <EmptyConversationState
                canChat={canChat}
                selectedAgent={selectedAgent}
                latestConversationId={latestConversationId}
                emptyPromptSuggestions={emptyPromptSuggestions}
                onSelectConversation={(conversationId) =>
                  selectConversation(conversationId, latestConversationAgentId)
                }
                onSubmitSuggestion={submitSuggestion}
                t={t}
              />
            ) : null}
            <div className="size-full min-h-0">
              <ChatMessageList
                key={activeConversationId ?? "new-conversation"}
                messages={messages}
                sending={sending}
                loading={loadingMessages}
                workspaceId={workspaceId ?? undefined}
                conversationId={activeConversationId}
                bottomRef={bottomRef}
                onEditMessage={editMessage}
                onDeleteMessage={deleteMessage}
                onResendMessage={resendMessage}
                onRegenerateAssistant={resendMessage}
                onJumpLatest={reloadActualLatestMessages}
                pendingApprovals={pendingApprovals}
                onApproveTool={approveToolInvocation}
                onRejectTool={rejectToolInvocation}
                onSuggestionClick={submitSuggestion}
              />
            </div>
          </section>
        )}
        {interfaceMode === CODING_INTERFACE_MODE &&
        codeWorkspaceArtifact ? null : (
          <ChatComposer
            input={input}
            canChat={canChat}
            sending={sending}
            queuedMessages={queuedMessages}
            onInputChange={setInput}
            onSubmit={submitMessage}
            onStop={stopGeneration}
            onQueuedMessageChange={updateQueuedMessage}
            onQueuedMessageCancel={cancelQueuedMessage}
            onUploadCodeWorkspace={uploadCodeWorkspace}
            onUploadChatAttachment={uploadChatAttachment}
            attachments={attachments}
            onRemoveAttachment={(attachmentId) =>
              setAttachments((current) =>
                current.filter((attachment) => attachment.id !== attachmentId),
              )
            }
          />
        )}
      </ChatLayout>
      {destructiveDialog}
    </>
  );
}
