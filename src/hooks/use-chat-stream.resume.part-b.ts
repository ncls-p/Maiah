import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import type {
  ChatCitation,
  ChatMessage,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import {
  STREAM_DRAFT_WRITE_BATCH_MS,
  approvalsFromDraft,
  filterResolvedApprovals,
  getStoredChatStreamDraft,
  storeChatStreamDraft,
  upsertPendingApproval,
} from "@/hooks/use-chat-stream-events";
import { notifyConversationStreaming } from "@/lib/workspace-history-events";
import {
  runChatStreamResumeSession,
  type ChatStreamResumeContext,
} from "./use-chat-stream.resume.part-c";

export function useChatStreamResume(input: {
  workspaceId: string | null;
  conversationId: string | null;
  streamingMessageId: string | null;
  sending: boolean;
  reloadConversationMessages: (
    signal: AbortSignal,
  ) => Promise<ChatMessage[] | null>;
  onConversationsRefresh: () => Promise<void>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setPendingApprovals: Dispatch<SetStateAction<PendingToolApproval[]>>;
  setCitations: Dispatch<SetStateAction<ChatCitation[]>>;
  setResuming: Dispatch<SetStateAction<boolean>>;
  activeRequestControllerRef: MutableRefObject<AbortController | null>;
  activeConversationIdRef: MutableRefObject<string | null>;
  resolvedApprovalIdsRef: MutableRefObject<Set<string>>;
}) {
  const {
    workspaceId,
    conversationId,
    streamingMessageId,
    sending,
    reloadConversationMessages,
    onConversationsRefresh,
    setMessages,
    setPendingApprovals,
    setCitations,
    setResuming,
    activeRequestControllerRef,
    activeConversationIdRef,
    resolvedApprovalIdsRef,
  } = input;
  useEffect(() => {
    if (!conversationId || !streamingMessageId || sending) return;

    const activeConversationId = conversationId;
    const activeStreamingMessageId = streamingMessageId;
    const controller = new AbortController();
    activeRequestControllerRef.current = controller;
    activeConversationIdRef.current = activeConversationId;
    let cleanedUp = false;
    let resumeDraft = getStoredChatStreamDraft(activeConversationId);
    let resumeDraftWriteTimeout: number | null = null;
    let assistantDraft: ChatMessage | null = null;
    let renderFrame: number | null = null;
    queueMicrotask(() => {
      if (!cleanedUp) setResuming(true);
    });
    notifyConversationStreaming(workspaceId, activeConversationId, true);

    function cancelScheduledResumeDraftWrite() {
      if (resumeDraftWriteTimeout === null) return;
      window.clearTimeout(resumeDraftWriteTimeout);
      resumeDraftWriteTimeout = null;
    }

    function writeResumeDraft() {
      if (!resumeDraft) return;
      storeChatStreamDraft(resumeDraft, { notify: false });
    }

    function persistResumeDraft(options: { immediate?: boolean } = {}) {
      if (options.immediate) {
        cancelScheduledResumeDraftWrite();
        writeResumeDraft();
        return;
      }
      if (resumeDraftWriteTimeout !== null) return;
      resumeDraftWriteTimeout = window.setTimeout(() => {
        resumeDraftWriteTimeout = null;
        writeResumeDraft();
      }, STREAM_DRAFT_WRITE_BATCH_MS);
    }

    function commitAssistantDraft() {
      if (!assistantDraft) return;
      const next = assistantDraft;
      setMessages((current) =>
        current.map((message) =>
          message.id === activeStreamingMessageId ? next : message,
        ),
      );
    }

    function cancelScheduledRender() {
      if (renderFrame === null) return;
      window.cancelAnimationFrame(renderFrame);
      renderFrame = null;
    }

    function flushAssistantRender() {
      if (renderFrame === null) return;
      cancelScheduledRender();
      commitAssistantDraft();
    }

    function scheduleAssistantRender() {
      if (renderFrame !== null) return;
      renderFrame = window.requestAnimationFrame(() => {
        renderFrame = null;
        commitAssistantDraft();
      });
    }

    function updateAssistant(updater: (message: ChatMessage) => ChatMessage) {
      if (assistantDraft) {
        assistantDraft = updater(assistantDraft);
        scheduleAssistantRender();
      } else {
        setMessages((current) => {
          const existing = current.find(
            (message) => message.id === activeStreamingMessageId,
          );
          if (!existing) return current;
          assistantDraft = updater(existing);
          return current.map((message) =>
            message.id === activeStreamingMessageId ? assistantDraft! : message,
          );
        });
      }
      if (
        assistantDraft &&
        resumeDraft?.assistantMessage.id === activeStreamingMessageId
      ) {
        resumeDraft = {
          ...resumeDraft,
          assistantMessage: assistantDraft,
          updatedAt: Date.now(),
        };
        persistResumeDraft();
      }
    }

    function updatePendingApprovals(
      updater: (approvals: PendingToolApproval[]) => PendingToolApproval[],
    ) {
      setPendingApprovals((current) =>
        filterResolvedApprovals(
          updater(current),
          resolvedApprovalIdsRef.current,
        ),
      );
      if (resumeDraft?.assistantMessage.id === activeStreamingMessageId) {
        const nextApprovals = filterResolvedApprovals(
          updater(approvalsFromDraft(resumeDraft)),
          resolvedApprovalIdsRef.current,
        );
        resumeDraft = {
          ...resumeDraft,
          pendingApprovals: nextApprovals,
          pendingApproval: nextApprovals[0] ?? null,
          updatedAt: Date.now(),
        };
        persistResumeDraft({ immediate: true });
      }
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

    function refreshDirectory() {
      void onConversationsRefresh().catch(() => undefined);
    }

    function cleanupOnce() {
      if (cleanedUp) return;
      cleanedUp = true;
      flushAssistantRender();
      cancelScheduledRender();
      cancelScheduledResumeDraftWrite();
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null;
        activeConversationIdRef.current = null;
        setResuming(false);
      }
    }

    const context: ChatStreamResumeContext = {
      workspaceId,
      activeConversationId,
      activeStreamingMessageId,
      controller,
      reloadConversationMessages,
      setCitations,
      updateAssistant,
      addPendingApproval,
      clearPendingApprovals,
      refreshDirectory,
      cleanupOnce,
    };

    return runChatStreamResumeSession(context);
  }, [
    conversationId,
    workspaceId,
    streamingMessageId,
    sending,
    reloadConversationMessages,
    onConversationsRefresh,
    activeConversationIdRef,
    activeRequestControllerRef,
    resolvedApprovalIdsRef,
    setCitations,
    setMessages,
    setPendingApprovals,
    setResuming,
  ]);
}