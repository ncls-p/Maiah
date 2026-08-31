"use client";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, ComponentProps } from "react";
import { type QueuedChatMessage, ChatComposer } from "@/components/chat/chat-composer";
import { assistantSelectionNeedsSetup, isAssistantSelectionLoading } from "@/components/chat/assistant-selection";
import { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import { CODE_WORKSPACE_CHAT_WIDTH_STORAGE_KEY, DEFAULT_CHAT_WIDTH, normalizeCodeWorkspaceChatWidth, MAX_CHAT_WIDTH, MIN_CHAT_WIDTH } from "@/components/chat/code-workspace-layout";
import { useWorkspace } from "@/hooks/use-workspace";
import { canAdoptRouteConversation } from "@/lib/chat-navigation";
import { DEFAULT_EPHEMERAL_TTL_MINUTES, isEphemeralTtlMinutes } from "@/modules/chat/ephemeral-retention";
import { CHAT_INTERFACE_MODE, type InterfaceMode, CODING_INTERFACE_MODE } from "./chat-interface-mode";
import { rotatePromptSuggestions, ChatContextBar } from "./chat-page-helpers";
import { useChatDirectory } from "./page.use-chat-directory";
import { useConversationActions } from "./page.use-conversation-actions";
import { useConversationHistoryLiveStatus } from "./page.use-conversation-live-status";
import { useComposerActions } from "./page.use-composer-actions";
import { useComposerDraft } from "./page.use-composer-draft";
import { useMessageActions } from "./page.use-message-actions";
import { useTemporaryConversationPersistence } from "./page.use-temporary-conversation";
import { useChatSession } from "./page.use-chat-session";
import { useCodeWorkspaceArtifactEvent } from "./page.use-code-workspace-artifact-event";
import { useReasoningEffort } from "./page.use-reasoning-effort";
import { ChatLayout } from "@/components/chat/chat-layout";
import { ChatMessageList, CodeWorkspaceArtifactCard } from "@/components/chat/chat-message-list";
import { CodeWorkspaceResizeHandle } from "@/components/chat/code-workspace-artifact-card";
import { ConversationRetentionBanner } from "@/components/chat/temporary-conversation-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeWorkspaceModeBar, EmptyConversationState, ChatPageLoading, NoAssistantsState } from "./chat-page-view";

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
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  const [codeWorkspaceArtifact, setCodeWorkspaceArtifact] =
    useState<CodeWorkspaceArtifact | null>(null);
  const [interfaceMode, setInterfaceMode] =
    useState<InterfaceMode>(CHAT_INTERFACE_MODE);
  const [codingChatWidth, setCodingChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastAutoOpenedWorkspaceRef = useRef<string | null>(null);
  const userSelectedInterfaceModeRef = useRef<InterfaceMode | null>(null);
  const newConversationAgentIdRef = useRef<string | null>(null);
  const internallyReplacedConversationIdRef = useRef<string | null>(null);
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
  const {
    attachments,
    composerDraftScopeRef,
    input,
    restoreComposerDraft,
    saveCurrentComposerDraft,
    setAttachments,
    setInput,
  } = useComposerDraft(workspaceId, selectedAgentId, activeConversationId);
  useEffect(() => {
    if (selectedAgentId) newConversationAgentIdRef.current = selectedAgentId;
  }, [selectedAgentId]);

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
      internallyReplacedConversationIdRef.current = conversationId;
      const params = new URLSearchParams({ conversationId });
      if (agentId) params.set("agentId", agentId);
      if (isTemporary) {
        params.set("temporary", "true");
        params.set("ttl", String(ttlMinutes));
      }
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    },
    [pathname],
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
    conversationLoadError,
    retryConversationLoad,
    quota,
    canChat,
    activeVersion,
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
  const latestTerminalAssistantMessageId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" &&
            (message.status === "completed" ||
              message.status === "failed" ||
              message.status === "cancelled"),
        )?.id ?? null,
    [messages],
  );
  useConversationHistoryLiveStatus({
    workspaceId,
    conversationId: activeConversationId,
    throughMessageId: latestTerminalAssistantMessageId,
    ready: !loadingMessages && !conversationLoadError,
    sending,
  });

  const selectionLoading = isAssistantSelectionLoading({
    workspaceLoading,
    agentsLoading: loadingAgents,
    selectedAgent,
    activeVersion,
  });
  const needsSetup = assistantSelectionNeedsSetup({
    isLoading: selectionLoading,
    selectedAgent,
    activeVersion,
  });
  const maxInputCharacters =
    activeVersion?.memoryPolicyJson?.maxInputCharacters ?? 32_000;
  const { reasoningPresets, reasoningEffort, setReasoningEffort } =
    useReasoningEffort(workspaceId, selectedAgentId, activeVersion);

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
    const internallyReplacedConversationId =
      routeConversationId &&
      internallyReplacedConversationIdRef.current === routeConversationId
        ? routeConversationId
        : null;
    if (internallyReplacedConversationId) {
      internallyReplacedConversationIdRef.current = null;
    }
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
    if (
      canAdoptRouteConversation({
        routeConversationId,
        activeConversationId,
        internallyReplacedConversationId,
      })
    ) {
      selectConversation(routeConversationId!, availableRouteAgentId);
      return;
    }
    if (!routeConversationId && activeConversationId) {
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
    reasoningEffort,
  });

  const {
    editMessage,
    deleteMessage,
    regenerateAssistantResponse,
    continueAssistantResponse,
    forkConversation,
    forkingMessageId,
    navigateConversationBranch,
    reloadActualLatestMessages,
    reloadAgentContext,
    approveToolInvocation,
    rejectToolInvocation,
  } = useMessageActions({
    activeConversationId,
    workspaceId,
    selectedAgentId,
    reasoningEffort,
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
    selectConversation,
    t,
  });

  const {
    convertingTemporaryConversation,
    extendingTemporaryConversation,
    extendTemporaryConversation,
    makeConversationPersistent,
  } = useTemporaryConversationPersistence({
    workspaceId,
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
    isLoading: selectionLoading,
    needsSetup,
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
    needsSetup,
    isLoading: selectionLoading,
    canCreateAgent,
    canRunSetup,
    cancelQueuedMessage,
    chooseInterfaceMode,
    codeWorkspaceArtifact,
    codingChatWidth,
    continueAssistantResponse,
    forkConversation,
    forkingMessageId,
    conversationImpact,
    conversationLoadError,
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
    maxInputCharacters,
    loadingMessages,
    makeConversationPersistent,
    messages,
    organizationDefaultAgentId,
    pendingApprovals,
    reasoningEffort,
    reasoningPresets,
    queuedMessages,
    quota,
    rejectToolInvocation,
    reloadActualLatestMessages,
    retryConversationLoad,
    reloadAgentContext,
    regenerateAssistantResponse,
    navigateConversationBranch,
    selectAgent,
    selectedAgent,
    selectedAgentId,
    sending,
    setAttachments,
    setInput,
    setReasoningEffort,
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


type Model = Extract<
  ReturnType<typeof useChatPageController>,
  { kind: "ready" }
>;
export function ChatPageView({ model }: { model: Model }) {
  const {
    activeConversationId,
    agents,
    approveToolInvocation,
    attachments,
    bottomRef,
    canChat,
    needsSetup,
    isLoading,
    canCreateAgent,
    canRunSetup,
    cancelQueuedMessage,
    chooseInterfaceMode,
    codeWorkspaceArtifact,
    codingChatWidth,
    continueAssistantResponse,
    forkConversation,
    forkingMessageId,
    conversationImpact,
    conversationLoadError,
    conversationIsOwner,
    conversationReadOnly,
    convertingTemporaryConversation,
    effectiveEphemeral,
    effectiveEphemeralTtlMinutes,
    ephemeralExpiresAt,
    extendTemporaryConversation,
    extendingTemporaryConversation,
    makeConversationPersistent,
  } = model;
  const {
    deleteMessage,
    editMessage,
    emptyPromptSuggestions,
    input,
    interfaceMode,
    latestTodoList,
    maxInputCharacters,
    loadingMessages,
    messages,
    organizationDefaultAgentId,
    pendingApprovals,
    reasoningEffort,
    reasoningPresets,
  } = model;
  const {
    queuedMessages,
    quota,
    rejectToolInvocation,
    reloadActualLatestMessages,
    retryConversationLoad,
    reloadAgentContext,
    regenerateAssistantResponse,
    navigateConversationBranch,
    selectAgent,
    selectedAgent,
    selectedAgentId,
    sending,
    setAttachments,
  } = model;
  const {
    setInput,
    setUserDefaultAgent,
    setReasoningEffort,
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
  } = model;
  const ownerEditMessage = conversationIsOwner ? editMessage : undefined;
  const ownerDeleteMessage = conversationIsOwner ? deleteMessage : undefined;
  const ownerRegenerateResponse = conversationIsOwner
    ? regenerateAssistantResponse
    : undefined;
  const ownerContinueResponse = conversationIsOwner
    ? continueAssistantResponse
    : undefined;
  const availableForkConversation = conversationReadOnly
    ? undefined
    : forkConversation;
  return (
    <ChatLayout
      agents={agents}
      selectedAgent={selectedAgent}
      selectedAgentId={selectedAgentId}
      activeConversationId={activeConversationId}
      conversationImpact={conversationImpact}
      conversationIsOwner={conversationIsOwner}
      organizationDefaultAgentId={organizationDefaultAgentId}
      userDefaultAgentId={userDefaultAgentId}
      isLoading={isLoading}
      needsSetup={needsSetup}
      canCreateAgent={canCreateAgent}
      canRunSetup={canRunSetup}
      onSelectAgent={selectAgent}
      onSetUserDefaultAgent={(agentId: string | null) =>
        void setUserDefaultAgent(agentId)
      }
      onSetupComplete={() => void reloadAgentContext()}
      reasoningPresets={reasoningPresets}
      reasoningEffort={reasoningEffort}
      onReasoningEffortChange={setReasoningEffort}
    >
      <ChatContextBar quota={quota} />
      {effectiveEphemeral ? (
        <ConversationRetentionBanner
          temporary
          ttlMinutes={effectiveEphemeralTtlMinutes}
          expiresAt={ephemeralExpiresAt}
          hasConversation={Boolean(activeConversationId)}
          canConvert={conversationIsOwner}
          converting={convertingTemporaryConversation}
          extending={extendingTemporaryConversation}
          onConvert={() => void makeConversationPersistent()}
          onExtend={(ttlMinutes) =>
            void extendTemporaryConversation(ttlMinutes)
          }
        />
      ) : null}
      {conversationReadOnly ? (
        <div className="border-b bg-muted/40 px-4 py-2 text-center text-xs text-muted-foreground">
          {t("share.readOnlyNotice")}
        </div>
      ) : null}
      {codeWorkspaceArtifact ? (
        <CodeWorkspaceModeBar
          artifact={codeWorkspaceArtifact}
          interfaceMode={interfaceMode}
          onModeChange={chooseInterfaceMode}
        />
      ) : null}
      {conversationLoadError ? (
        <div className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4">
          <Alert variant="destructive">
            <AlertTitle>{t("errors.loadConversationFailed")}</AlertTitle>
            <AlertDescription className="mt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={retryConversationLoad}
              >
                {t("errors.retryConversationLoad")}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : interfaceMode === CODING_INTERFACE_MODE && codeWorkspaceArtifact ? (
        <section
          className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-background lg:[grid-template-columns:var(--coding-chat-width)_0.75rem_minmax(0,1fr)]"
          style={
            { "--coding-chat-width": `${codingChatWidth}px` } as CSSProperties
          }
        >
          <aside
            className="flex min-h-0 flex-col bg-muted/10"
            id="coding-chat-panel"
          >
            <div className="border-b border-border/50 px-3 py-2">
              <p className="text-xs font-medium text-foreground">
                {t("codingPanelTitle")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("codingPanelDescription")}
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
                  onEditMessage={ownerEditMessage}
                  onDeleteMessage={ownerDeleteMessage}
                  onRegenerateAssistant={ownerRegenerateResponse}
                  onContinueAssistant={ownerContinueResponse}
                  onForkMessage={availableForkConversation}
                  onNavigateBranch={navigateConversationBranch}
                  forkingMessageId={forkingMessageId}
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
              maxInputCharacters={maxInputCharacters}
              canChat={canChat && !conversationLoadError}
              needsSetup={needsSetup}
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
              todoList={latestTodoList}
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
            <EmptyConversationState needsSetup={needsSetup} t={t} />
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
              onEditMessage={ownerEditMessage}
              onDeleteMessage={ownerDeleteMessage}
              onRegenerateAssistant={ownerRegenerateResponse}
              onContinueAssistant={ownerContinueResponse}
              onForkMessage={availableForkConversation}
              onNavigateBranch={navigateConversationBranch}
              forkingMessageId={forkingMessageId}
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
          maxInputCharacters={maxInputCharacters}
          canChat={canChat && !conversationLoadError}
          needsSetup={needsSetup}
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
          todoList={latestTodoList}
          centered={!loadingMessages && messages.length === 0}
          promptSuggestions={emptyPromptSuggestions}
          onPromptSuggestionClick={submitSuggestion}
          onRemoveAttachment={(attachmentId) =>
            setAttachments((current) =>
              current.filter((attachment) => attachment.id !== attachmentId),
            )
          }
        />
      )}
    </ChatLayout>
  );
}


type LayoutProps = Omit<ComponentProps<typeof ChatLayout>, "children">;

export function ChatPageBoundary(props: {
  state: "loading" | "empty";
  layoutProps: LayoutProps;
  emptyStateProps: ComponentProps<typeof NoAssistantsState>;
  loadingStateProps: ComponentProps<typeof ChatPageLoading>;
}) {
  const child =
    props.state === "loading" ? (
      <ChatPageLoading {...props.loadingStateProps} />
    ) : (
      <NoAssistantsState {...props.emptyStateProps} />
    );
  return <ChatLayout {...props.layoutProps}>{child}</ChatLayout>;
}

