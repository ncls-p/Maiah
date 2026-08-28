import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  ChatCitation,
  ChatMessage,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import {
  STREAM_DRAFT_WRITE_BATCH_MS,
  filterResolvedApprovals,
  storeChatStreamDraft,
  upsertPendingApproval,
} from "@/hooks/use-chat-stream-events";
import {
  type SubmitOptions,
  type UseChatStreamOptions,
} from "./use-chat-stream.compact-error-message";
import { createChatSubmitRun } from "./use-chat-stream.submit.part-c";

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
