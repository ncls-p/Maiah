import { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  createLocalMessage,
  prepareAssistantMessageContinuation,
  ChatCitation,
  ChatMessage,
  PendingToolApproval,
  ChatStreamEvent,
} from "@/components/chat/chat-types";
import {
  type SubmitOptions,
  type UseChatStreamOptions,
  appendErrorPart,
  compactErrorMessage,
} from "./use-chat-stream.compact-error-message";
import {
  STREAM_DRAFT_WRITE_BATCH_MS,
  filterResolvedApprovals,
  storeChatStreamDraft,
  upsertPendingApproval,
  applyStreamEvent,
  clearStoredChatStreamDraft,
} from "@/hooks/use-chat-stream-events";
import { toast } from "sonner";
import {
  migrateDraftCapabilityOverrides,
  readChatCapabilityOverrides,
} from "@/components/chat/chat-capability-overrides";
import { streamAiSdkUIChat } from "@/hooks/ai-sdk-ui-chat-transport";
import { notifyConversationStreaming } from "@/lib/workspace-history-events";

export function useChatSubmitHandler(input: {
  workspaceId: string | null;
  agentId: string | null;
  conversationId: string | null;
  canChat: boolean;
  sending: boolean;
  messages: ChatMessage[];
  onConversationCreated: UseChatStreamOptions["onConversationCreated"];
  onConversationTitle: UseChatStreamOptions["onConversationTitle"];
  onConversationMetadata: UseChatStreamOptions["onConversationMetadata"];
  onConversationsRefresh: UseChatStreamOptions["onConversationsRefresh"];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSending: Dispatch<SetStateAction<boolean>>;
  setPendingApprovals: Dispatch<SetStateAction<PendingToolApproval[]>>;
  setCitations: Dispatch<SetStateAction<ChatCitation[]>>;
  activeRequestControllerRef: MutableRefObject<AbortController | null>;
  activeConversationIdRef: MutableRefObject<string | null>;
  detachedRequestControllersRef: MutableRefObject<WeakSet<AbortController>>;
  stopRequestedRef: MutableRefObject<boolean>;
  resolvedApprovalIdsRef: MutableRefObject<Set<string>>;
  onBeforeSubmit?: () => void;
}) {
  const {
    workspaceId,
    agentId,
    conversationId,
    canChat,
    sending,
    messages,
    onConversationCreated,
    onConversationTitle,
    onConversationMetadata,
    onConversationsRefresh,
    setMessages,
    setSending,
    setPendingApprovals,
    setCitations,
    activeRequestControllerRef,
    activeConversationIdRef,
    detachedRequestControllersRef,
    stopRequestedRef,
    resolvedApprovalIdsRef,
    onBeforeSubmit,
  } = input;
  async function handleSubmit(content: string, options: SubmitOptions = {}) {
    if (!content) return false;
    if (!agentId) return false;
    if (!canChat) return false;
    if (sending) return false;

    const userMessageFileParts = [
      ...(options.codeWorkspaceArtifact
        ? [
            {
              type: "file",
              content: JSON.stringify(options.codeWorkspaceArtifact),
            },
          ]
        : []),
      ...(options.attachments ?? []).map((attachment) => ({
        type: "file",
        content: JSON.stringify(attachment),
      })),
    ];
    const userMessage = createLocalMessage(
      "user",
      content,
      userMessageFileParts,
    );
    const continuedAssistantMessage = options.continueFromMessageId
      ? messages.find(
          (message) =>
            message.id === options.continueFromMessageId &&
            message.role === "assistant",
        )
      : null;
    if (options.continueFromMessageId && !continuedAssistantMessage)
      return false;
    onBeforeSubmit?.();
    const assistantMessage = continuedAssistantMessage
      ? prepareAssistantMessageContinuation(continuedAssistantMessage)
      : createLocalMessage("assistant", "");
    const session = createChatSubmitSession({
      content,
      options,
      userMessage,
      assistantMessage,
      workspaceId,
      agentId,
      conversationId,
      activeRequestControllerRef,
      activeConversationIdRef,
      detachedRequestControllersRef,
      stopRequestedRef,
      resolvedApprovalIdsRef,
      setMessages,
      setSending,
      setPendingApprovals,
      setCitations,
      onConversationTitle,
      onConversationMetadata,
      onConversationCreated,
      onConversationsRefresh,
    });
    stopRequestedRef.current = false;
    setMessages((current) => {
      if (options.continueFromMessageId) {
        return current.map((message) =>
          message.id === options.continueFromMessageId
            ? assistantMessage
            : message,
        );
      }
      if (options.reuseUserMessage && options.resendFromMessageId) {
        const messageIndex = current.findIndex(
          (message) => message.id === options.resendFromMessageId,
        );
        if (messageIndex >= 0) {
          return [...current.slice(0, messageIndex + 1), assistantMessage];
        }
      }
      return [...current, userMessage, assistantMessage];
    });
    setSending(true);
    session.clearPendingApprovals();
    setCitations([]);
    session.persistDraft({ immediate: true });

    const controller = new AbortController();
    activeRequestControllerRef.current = controller;
    activeConversationIdRef.current = session.getActiveConversationId();

    return session.run(controller);
  }
  return handleSubmit;
}

export type ChatSubmitSessionInput = {
  content: string;
  options: SubmitOptions;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  workspaceId: string | null;
  agentId: string;
  conversationId: string | null;
  activeRequestControllerRef: MutableRefObject<AbortController | null>;
  activeConversationIdRef: MutableRefObject<string | null>;
  detachedRequestControllersRef: MutableRefObject<WeakSet<AbortController>>;
  stopRequestedRef: MutableRefObject<boolean>;
  resolvedApprovalIdsRef: MutableRefObject<Set<string>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSending: Dispatch<SetStateAction<boolean>>;
  setPendingApprovals: Dispatch<SetStateAction<PendingToolApproval[]>>;
  setCitations: Dispatch<SetStateAction<ChatCitation[]>>;
  onConversationTitle: UseChatStreamOptions["onConversationTitle"];
  onConversationMetadata: UseChatStreamOptions["onConversationMetadata"];
  onConversationCreated: UseChatStreamOptions["onConversationCreated"];
  onConversationsRefresh: UseChatStreamOptions["onConversationsRefresh"];
};

export type ChatSubmitSessionState = {
  activeConversationId: string | null;
  assistantMessageId: string;
  assistantDraft: ChatMessage;
  pendingApprovalsDraft: PendingToolApproval[];
  renderBatchTimeout: number | null;
  draftWriteTimeout: number | null;
};

export function createChatSubmitSession(input: ChatSubmitSessionInput) {
  const state: ChatSubmitSessionState = {
    activeConversationId: input.conversationId,
    assistantMessageId: input.assistantMessage.id,
    assistantDraft: input.assistantMessage,
    pendingApprovalsDraft: [],
    renderBatchTimeout: null,
    draftWriteTimeout: null,
  };
  const {
    assistantMessage,
    setMessages,
    setPendingApprovals,
    resolvedApprovalIdsRef,
  } = input;

  function commitAssistantDraft() {
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantMessage.id ||
        message.id === state.assistantMessageId
          ? state.assistantDraft
          : message,
      ),
    );
  }

  function cancelScheduledRender() {
    if (state.renderBatchTimeout === null) return;
    window.cancelAnimationFrame(state.renderBatchTimeout);
    state.renderBatchTimeout = null;
  }

  function flushAssistantRender() {
    if (state.renderBatchTimeout === null) return;
    cancelScheduledRender();
    commitAssistantDraft();
  }

  function scheduleAssistantRender() {
    if (state.renderBatchTimeout !== null) return;
    // Align commits to the next paint so markdown updates feel continuous.
    state.renderBatchTimeout = window.requestAnimationFrame(() => {
      state.renderBatchTimeout = null;
      commitAssistantDraft();
    });
  }

  function cancelScheduledDraftWrite() {
    if (state.draftWriteTimeout === null) return;
    window.clearTimeout(state.draftWriteTimeout);
    state.draftWriteTimeout = null;
  }

  function writeDraft() {
    const activeConversationId = state.activeConversationId;
    if (!activeConversationId) return;
    const visibleApprovals = filterResolvedApprovals(
      state.pendingApprovalsDraft,
      resolvedApprovalIdsRef.current,
    );
    storeChatStreamDraft(
      {
        conversationId: activeConversationId,
        assistantMessage: state.assistantDraft,
        pendingApprovals: visibleApprovals,
        pendingApproval: visibleApprovals[0] ?? null,
        updatedAt: Date.now(),
      },
      { notify: false },
    );
  }

  function persistDraft(options: { immediate?: boolean } = {}) {
    if (options.immediate) {
      cancelScheduledDraftWrite();
      writeDraft();
      return;
    }
    if (state.draftWriteTimeout !== null) return;
    state.draftWriteTimeout = window.setTimeout(() => {
      state.draftWriteTimeout = null;
      writeDraft();
    }, STREAM_DRAFT_WRITE_BATCH_MS);
  }

  function updatePendingApprovals(
    updater: (approvals: PendingToolApproval[]) => PendingToolApproval[],
  ) {
    state.pendingApprovalsDraft = filterResolvedApprovals(
      updater(state.pendingApprovalsDraft),
      resolvedApprovalIdsRef.current,
    );
    setPendingApprovals(state.pendingApprovalsDraft);
    persistDraft({ immediate: true });
  }

  function addPendingApproval(approval: PendingToolApproval) {
    if (resolvedApprovalIdsRef.current.has(approval.invocationId)) return;
    updatePendingApprovals((approvals) =>
      upsertPendingApproval(approvals, approval),
    );
  }

  function clearPendingApprovals() {
    updatePendingApprovals(() => []);
  }

  function updateAssistantDraft(
    updater: (message: ChatMessage) => ChatMessage,
  ) {
    state.assistantDraft = updater(state.assistantDraft);
    scheduleAssistantRender();
    persistDraft();
  }

  const run = createChatSubmitRun(input, state, {
    updateAssistantDraft,
    addPendingApproval,
    clearPendingApprovals,
    flushAssistantRender,
    persistDraft,
    cancelScheduledDraftWrite,
    cancelScheduledRender,
  });

  return {
    getActiveConversationId: () => state.activeConversationId,
    clearPendingApprovals,
    persistDraft,
    run,
  };
}

export function createChatSubmitRun(
  input: ChatSubmitSessionInput,
  state: ChatSubmitSessionState,
  api: {
    updateAssistantDraft: (
      updater: (message: ChatMessage) => ChatMessage,
    ) => void;
    addPendingApproval: (approval: PendingToolApproval) => void;
    clearPendingApprovals: () => void;
    flushAssistantRender: () => void;
    persistDraft: (options?: { immediate?: boolean }) => void;
    cancelScheduledDraftWrite: () => void;
    cancelScheduledRender: () => void;
  },
): (controller: AbortController) => Promise<boolean> {
  const {
    content,
    options,
    userMessage,
    assistantMessage,
    workspaceId,
    agentId,
    conversationId,
    activeRequestControllerRef,
    activeConversationIdRef,
    detachedRequestControllersRef,
    stopRequestedRef,
    setMessages,
    setSending,
    setCitations,
    onConversationTitle,
    onConversationMetadata,
    onConversationCreated,
    onConversationsRefresh,
  } = input;

  return async (controller: AbortController) => {
    function handleStreamEvent(parsed: ChatStreamEvent) {
      applyStreamEvent(parsed, {
        updateAssistant: api.updateAssistantDraft,
        addPendingApproval: api.addPendingApproval,
        clearPendingApprovals: api.clearPendingApprovals,
        setCitations,
        onConversationTitle: (title) => {
          const targetConversationId = activeConversationIdRef.current;
          if (targetConversationId) {
            onConversationTitle?.(targetConversationId, title);
          }
        },
      });
    }

    try {
      const attachmentsToSend = options.attachments ?? [];
      await streamAiSdkUIChat({
        api: `/api/workspace/${agentId}/chat`,
        chatId: state.activeConversationId ?? userMessage.id,
        content,
        localUserMessageId: userMessage.id,
        resendFromMessageId: options.resendFromMessageId,
        body: {
          content,
          conversationId: conversationId ?? undefined,
          ephemeral: options.ephemeral,
          ephemeralTtlMinutes: options.ephemeralTtlMinutes,
          reasoningEffort: options.reasoningEffort,
          resendFromMessageId: options.resendFromMessageId,
          regenerateAssistantMessageId: options.regenerateAssistantMessageId,
          continueFromMessageId: options.continueFromMessageId,
          codeWorkspaceId:
            options.codeWorkspaceId ?? options.codeWorkspaceArtifact?.projectId,
          attachmentIds: attachmentsToSend.flatMap((attachment) =>
            attachment.kind === "chat_file" ? [attachment.id] : [],
          ),
          imageAttachmentIds: attachmentsToSend.flatMap((attachment) =>
            attachment.kind === "chat_image" ? [attachment.id] : [],
          ),
          capabilityOverrides: readChatCapabilityOverrides(
            agentId,
            conversationId,
          ),
        },
        abortSignal: controller.signal,
        onStart: (metadata) => {
          onConversationMetadata?.(metadata);
          if (options.regenerateAssistantMessageId && metadata.conversationId) {
            const conversationIds = Array.from(
              new Set([
                ...(options.responseVersionConversationIds ??
                  (conversationId ? [conversationId] : [])),
                metadata.conversationId,
              ]),
            );
            state.assistantDraft = {
              ...state.assistantDraft,
              branch: {
                conversationIds,
                activeIndex: conversationIds.indexOf(metadata.conversationId),
              },
            };
          }
          if (metadata.conversationId) {
            state.activeConversationId = metadata.conversationId;
            activeConversationIdRef.current = metadata.conversationId;
            notifyConversationStreaming(
              workspaceId,
              metadata.conversationId,
              true,
            );
          }
          if (metadata.messageId) {
            state.assistantMessageId = metadata.messageId;
            state.assistantDraft = {
              ...state.assistantDraft,
              id: metadata.messageId,
              streamGenerationId: metadata.streamGenerationId,
            };
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id
                  ? state.assistantDraft
                  : message,
              ),
            );
            api.persistDraft({ immediate: true });
          }
          if (metadata.userMessageId) {
            setMessages((current) =>
              current.map((message) =>
                message.id === userMessage.id ||
                (options.reuseUserMessage &&
                  message.id === options.resendFromMessageId)
                  ? { ...message, id: metadata.userMessageId! }
                  : message,
              ),
            );
          }
          if (
            metadata.conversationId &&
            metadata.conversationId !== conversationId
          ) {
            migrateDraftCapabilityOverrides(agentId, metadata.conversationId);
            onConversationCreated(metadata.conversationId, content, {
              responseVersion: Boolean(options.regenerateAssistantMessageId),
            });
          }
        },
        onEvent: handleStreamEvent,
      });

      api.updateAssistantDraft((message) => ({
        ...message,
        status: "completed",
      }));
      api.flushAssistantRender();
      api.clearPendingApprovals();
      if (state.activeConversationId)
        clearStoredChatStreamDraft(state.activeConversationId);
      notifyConversationStreaming(
        workspaceId,
        state.activeConversationId,
        false,
        {
          markUnread: false,
        },
      );

      await onConversationsRefresh().catch(() => undefined);
      return true;
    } catch (err) {
      const requestWasDetached =
        detachedRequestControllersRef.current.has(controller);
      if (err instanceof Error && err.name === "AbortError") {
        if (requestWasDetached) {
          api.persistDraft({ immediate: true });
          return true;
        }
        api.updateAssistantDraft((message) => ({
          ...message,
          status: stopRequestedRef.current ? "cancelled" : "completed",
        }));
        api.flushAssistantRender();
        api.clearPendingApprovals();
        if (state.activeConversationId)
          clearStoredChatStreamDraft(state.activeConversationId);
        notifyConversationStreaming(
          workspaceId,
          state.activeConversationId,
          false,
          {
            markUnread: false,
          },
        );
        return false;
      }
      const errorMessage =
        err instanceof Error ? err.message : "Chat request failed";
      toast.error(compactErrorMessage(errorMessage));
      api.updateAssistantDraft((message) =>
        options.continueFromMessageId
          ? { ...message, status: "completed" }
          : appendErrorPart(message, errorMessage),
      );
      api.flushAssistantRender();
      api.clearPendingApprovals();
      if (state.activeConversationId)
        clearStoredChatStreamDraft(state.activeConversationId);
      notifyConversationStreaming(
        workspaceId,
        state.activeConversationId,
        false,
        {
          markUnread: false,
        },
      );
      return false;
    } finally {
      const requestWasDetached =
        detachedRequestControllersRef.current.has(controller);
      if (!requestWasDetached) api.flushAssistantRender();
      api.cancelScheduledDraftWrite();
      api.cancelScheduledRender();
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null;
        activeConversationIdRef.current = null;
      }
      if (!requestWasDetached) {
        stopRequestedRef.current = false;
        setSending(false);
      }
    }
  };
}
