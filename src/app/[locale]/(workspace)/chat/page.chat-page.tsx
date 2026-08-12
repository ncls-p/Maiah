"use client";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type QueuedChatMessage } from "@/components/chat/chat-composer";
import {
  chatComposerDraftKey,
  readChatComposerDraft,
  writeChatComposerDraft,
} from "@/components/chat/chat-composer-draft";
import type {
  ChatAttachment,
  CodeWorkspaceArtifact,
} from "@/components/chat/chat-types";
import {
  CODE_WORKSPACE_CHAT_WIDTH_STORAGE_KEY,
  DEFAULT_CHAT_WIDTH,
  normalizeCodeWorkspaceChatWidth,
} from "@/components/chat/code-workspace-layout";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  DEFAULT_EPHEMERAL_TTL_MINUTES,
  isEphemeralTtlMinutes,
} from "@/modules/chat/ephemeral-retention";
import { CHAT_INTERFACE_MODE, type InterfaceMode } from "./chat-interface-mode";
import { rotatePromptSuggestions } from "./chat-page-helpers";
import { useChatDirectory } from "./page.use-chat-directory";
import { useConversationActions } from "./page.use-conversation-actions";
import { useComposerActions } from "./page.use-composer-actions";
import { useMessageActions } from "./page.use-message-actions";
import { useTemporaryConversationPersistence } from "./page.use-temporary-conversation";
import { useChatSession } from "./page.use-chat-session";
import { useCodeWorkspaceArtifactEvent } from "./page.use-code-workspace-artifact-event";
import { ChatPageView } from "./page.chat-page.view";
import { ChatPageBoundary } from "./page.chat-page-boundary";
export function useChatPageController() {
  const t = useTranslations(CHAT_INTERFACE_MODE);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [ephemeral, setEphemeral] = useState(false);
  const [ephemeralTtlMinutes, setEphemeralTtlMinutes] = useState(
    DEFAULT_EPHEMERAL_TTL_MINUTES,
  );
  const [ephemeralExpiresAt, setEphemeralExpiresAt] = useState<string | null>(
    null,
  );
  const routeTemporary = searchParams.get("temporary") === "true";
  const requestedTtlMinutes = Number(searchParams.get("ttl"));
  const routeTtlMinutes = isEphemeralTtlMinutes(requestedTtlMinutes)
    ? requestedTtlMinutes
    : DEFAULT_EPHEMERAL_TTL_MINUTES;
  const effectiveEphemeral = activeConversationId
    ? ephemeral || routeTemporary
    : routeTemporary;
  const effectiveEphemeralTtlMinutes = activeConversationId
    ? ephemeralTtlMinutes
    : routeTtlMinutes;
  const [input, setInput] = useState("");
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  const [codeWorkspaceArtifact, setCodeWorkspaceArtifact] =
    useState<CodeWorkspaceArtifact | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [interfaceMode, setInterfaceMode] =
    useState<InterfaceMode>(CHAT_INTERFACE_MODE);
  const [codingChatWidth, setCodingChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastAutoOpenedWorkspaceRef = useRef<string | null>(null);
  const userSelectedInterfaceModeRef = useRef<InterfaceMode | null>(null);
  const composerDraftScopeRef = useRef<{
    workspaceId: string;
    agentId: string;
    conversationId: string | null;
  } | null>(null);
  const newConversationAgentIdRef = useRef<string | null>(null);

  const {
    agents,
    selectedAgentId,
    setSelectedAgentId,
    organizationDefaultAgentId,
    setOrganizationDefaultAgentId,
    canCreateAgent,
    canRunSetup,
    userDefaultAgentId,
    setUserDefaultAgentId,
    conversations,
    setConversations,
    loadingAgents,
    setLoadingContext,
    loadAgentDirectory,
    refreshConversations,
  } = useChatDirectory(workspaceId, t, setActiveConversationId, pathname);

  const saveCurrentComposerDraft = useCallback(() => {
    const scope = composerDraftScopeRef.current;
    if (!scope) return;
    writeChatComposerDraft(
      scope.workspaceId,
      scope.agentId,
      scope.conversationId,
      { input, attachments },
    );
  }, [attachments, input]);

  const restoreComposerDraft = useCallback(
    (nextAgentId: string, nextConversationId: string | null) => {
      if (!workspaceId || !nextAgentId) return;
      saveCurrentComposerDraft();
      const nextDraft = readChatComposerDraft(
        workspaceId,
        nextAgentId,
        nextConversationId,
      );
      composerDraftScopeRef.current = {
        workspaceId,
        agentId: nextAgentId,
        conversationId: nextConversationId,
      };
      setInput(nextDraft.input);
      setAttachments(nextDraft.attachments);
    },
    [saveCurrentComposerDraft, workspaceId],
  );

  useEffect(() => {
    if (!workspaceId || !selectedAgentId) return;
    newConversationAgentIdRef.current = selectedAgentId;
    const expectedKey = chatComposerDraftKey(
      workspaceId,
      selectedAgentId,
      activeConversationId,
    );
    const current = composerDraftScopeRef.current;
    const currentKey = current
      ? chatComposerDraftKey(
          current.workspaceId,
          current.agentId,
          current.conversationId,
        )
      : null;
    if (currentKey !== expectedKey) {
      restoreComposerDraft(selectedAgentId, activeConversationId);
    }
  }, [
    activeConversationId,
    restoreComposerDraft,
    selectedAgentId,
    workspaceId,
  ]);

  useEffect(() => {
    saveCurrentComposerDraft();
  }, [saveCurrentComposerDraft]);

  function chooseInterfaceMode(mode: InterfaceMode) {
    userSelectedInterfaceModeRef.current = mode;
    setInterfaceMode(mode);
  }

  const resetInterfaceMode = useCallback(() => {
    userSelectedInterfaceModeRef.current = null;
    setInterfaceMode(CHAT_INTERFACE_MODE);
  }, []);

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

  useCodeWorkspaceArtifactEvent({
    lastAutoOpenedWorkspaceRef,
    userSelectedInterfaceModeRef,
    setCodeWorkspaceArtifact,
    setInterfaceMode,
  });
  const replaceConversationRoute = useCallback(
    (
      conversationId: string,
      agentId: string | null,
      isTemporary: boolean,
      ttlMinutes: number,
    ) => {
      const params = new URLSearchParams({ conversationId });
      if (agentId) params.set("agentId", agentId);
      if (isTemporary) {
        params.set("temporary", "true");
        params.set("ttl", String(ttlMinutes));
      }
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`,
      );
    },
    [],
  );

  const {
    messages,
    setMessages,
    sending,
    pendingApprovals,
    handleSubmit,
    resolveApproval,
    stopGeneration,
    detachActiveStream,
    setActiveVersion,
    loadingMessages,
    prepareConversationMessages,
    quota,
    canChat,
    conversationIsOwner,
    conversationReadOnly,
    latestTodoList,
    conversationImpact,
  } = useChatSession({
    workspaceId,
    selectedAgentId,
    activeConversationId,
    ephemeral: effectiveEphemeral,
    ephemeralTtlMinutes: effectiveEphemeralTtlMinutes,
    queuedMessages,
    interfaceMode,
    codeWorkspaceArtifact,
    lastAutoOpenedWorkspaceRef,
    userSelectedInterfaceModeRef,
    composerDraftScopeRef,
    saveCurrentComposerDraft,
    resetInterfaceMode,
    refreshConversations,
    replaceConversationRoute,
    setActiveConversationId,
    setEphemeral,
    setEphemeralTtlMinutes,
    setEphemeralExpiresAt,
    setSelectedAgentId,
    setConversations,
    setQueuedMessages,
    setCodeWorkspaceArtifact,
    setInterfaceMode,
    setLoadingContext,
  });

  const { selectAgent, selectConversation, startNewConversation } =
    useConversationActions({
      selectedAgentId,
      activeConversationId,
      conversations,
      newConversationAgentIdRef,
      setSelectedAgentId,
      setActiveConversationId,
      setActiveVersion,
      setQueuedMessages,
      setMessages,
      prepareConversationMessages,
      setCodeWorkspaceArtifact,
      setAttachments,
      detachActiveStream,
      restoreComposerDraft,
      resetInterfaceMode,
    });

  const routeConversationId = searchParams.get("conversationId");
  const routeAgentId = searchParams.get("agentId");
  const routeSearch = searchParams.toString();
  const availableRouteAgentId = agents.some(({ id }) => id === routeAgentId)
    ? routeAgentId
    : null;
  useEffect(() => {
    if (loadingAgents) return;
    // Native history updates are synchronous, while useSearchParams catches up
    // on the following render. Do not let a stale route snapshot undo the
    // assistant choice made by the user in between those two updates.
    if (window.location.search.slice(1) !== routeSearch) return;
    if (routeAgentId && !availableRouteAgentId) {
      const params = new URLSearchParams(routeSearch);
      params.delete("agentId");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        query ? `${pathname}?${query}` : pathname,
      );
      return;
    }
    if (routeConversationId && routeConversationId !== activeConversationId) {
      selectConversation(routeConversationId, availableRouteAgentId);
      return;
    }
    if (!routeConversationId && activeConversationId && !sending) {
      startNewConversation();
      return;
    }
    if (
      !routeConversationId &&
      availableRouteAgentId &&
      availableRouteAgentId !== selectedAgentId
    ) {
      selectAgent(availableRouteAgentId);
    }
  }, [
    activeConversationId,
    availableRouteAgentId,
    loadingAgents,
    pathname,
    routeAgentId,
    routeConversationId,
    routeSearch,
    selectAgent,
    selectConversation,
    selectedAgentId,
    sending,
    startNewConversation,
  ]);

  const {
    submitMessage,
    uploadCodeWorkspace,
    uploadChatAttachment,
    submitSuggestion,
    setUserDefaultAgent,
    updateQueuedMessage,
    cancelQueuedMessage,
  } = useComposerActions({
    workspaceId,
    activeConversationId,
    ephemeral: effectiveEphemeral,
    ephemeralTtlMinutes: effectiveEphemeralTtlMinutes,
    input,
    attachments,
    canChat,
    sending,
    interfaceMode,
    codeWorkspaceArtifact,
    handleSubmit,
    setInput,
    setAttachments,
    setQueuedMessages,
    setCodeWorkspaceArtifact,
    setInterfaceMode,
    setOrganizationDefaultAgentId,
    setUserDefaultAgentId,
    userSelectedInterfaceModeRef,
    lastAutoOpenedWorkspaceRef,
    t,
  });

  const {
    editMessage,
    deleteMessage,
    resendMessage,
    continueAssistantResponse,
    reloadActualLatestMessages,
    reloadAgentContext,
    approveToolInvocation,
    rejectToolInvocation,
  } = useMessageActions({
    activeConversationId,
    workspaceId,
    selectedAgentId,
    messages,
    sending,
    setMessages,
    handleSubmit,
    resolveApproval,
    refreshConversations,
    loadAgentDirectory,
    setCodeWorkspaceArtifact,
    setActiveVersion,
    setLoadingContext,
    t,
  });

  const {
    convertingTemporaryConversation,
    extendingTemporaryConversation,
    extendTemporaryConversation,
    makeConversationPersistent,
  } = useTemporaryConversationPersistence({
    activeConversationId,
    setEphemeral,
    setEphemeralTtlMinutes,
    setEphemeralExpiresAt,
    setConversations,
    translate: t,
  });

  const boundaryLayoutProps = {
    agents,
    selectedAgent,
    selectedAgentId,
    activeConversationId,
    organizationDefaultAgentId,
    userDefaultAgentId,
    canChat,
    canCreateAgent,
    canRunSetup,
    onSelectAgent: selectAgent,
    onSetUserDefaultAgent: (agentId: string | null) =>
      void setUserDefaultAgent(agentId),
    onSetupComplete: () => void reloadAgentContext(),
  };
  if (workspaceLoading || loadingAgents || agents.length === 0)
    return (
      <ChatPageBoundary
        state={workspaceLoading || loadingAgents ? "loading" : "empty"}
        layoutProps={boundaryLayoutProps}
        emptyStateProps={{ canCreateAgent, canRunSetup, t }}
        loadingStateProps={{ t }}
      />
    );

  return {
    kind: "ready",
    activeConversationId,
    agents,
    approveToolInvocation,
    attachments,
    bottomRef,
    canChat,
    canCreateAgent,
    canRunSetup,
    cancelQueuedMessage,
    chooseInterfaceMode,
    codeWorkspaceArtifact,
    codingChatWidth,
    continueAssistantResponse,
    conversationImpact,
    conversationIsOwner,
    conversationReadOnly,
    convertingTemporaryConversation,
    deleteMessage,
    editMessage,
    emptyPromptSuggestions,
    effectiveEphemeral,
    effectiveEphemeralTtlMinutes,
    ephemeralExpiresAt,
    extendTemporaryConversation,
    extendingTemporaryConversation,
    input,
    interfaceMode,
    latestTodoList,
    loadingMessages,
    makeConversationPersistent,
    messages,
    organizationDefaultAgentId,
    pendingApprovals,
    queuedMessages,
    quota,
    rejectToolInvocation,
    reloadActualLatestMessages,
    reloadAgentContext,
    resendMessage,
    selectAgent,
    selectedAgent,
    selectedAgentId,
    sending,
    setAttachments,
    setInput,
    setUserDefaultAgent,
    stopGeneration,
    submitMessage,
    submitSuggestion,
    t,
    updateCodingChatWidth,
    updateQueuedMessage,
    uploadChatAttachment,
    uploadCodeWorkspace,
    userDefaultAgentId,
    workspaceId,
  } as const;
}

export default function ChatPage(
  ...args: Parameters<typeof useChatPageController>
) {
  const model = useChatPageController(...args);
  if (!("kind" in model)) return model;
  return <ChatPageView model={model} />;
}
