import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import { toast } from "sonner";

import type {
  ChatCitation,
  ChatMessage,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import {
  STREAM_DRAFT_WRITE_BATCH_MS,
  applyStreamEvent,
  approvalsFromDraft,
  clearStoredChatStreamDraft,
  filterResolvedApprovals,
  getStoredChatStreamDraft,
  parseStreamEventText,
  storeChatStreamDraft,
  upsertPendingApproval,
} from "@/hooks/use-chat-stream-events";
import {
  appendErrorPart,
  compactErrorMessage,
} from "./use-chat-stream.compact-error-message";

export function useChatStreamResume(input: {
  conversationId: string | null;
  streamingMessageId: string | null;
  sending: boolean;
  reloadConversationMessages: () => Promise<void>;
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
    let completed = false;
    let resumeDraft = getStoredChatStreamDraft(activeConversationId);
    let resumeDraftWriteTimeout: number | null = null;
    queueMicrotask(() => setResuming(true));

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

    function updateAssistant(updater: (message: ChatMessage) => ChatMessage) {
      setMessages((current) =>
        current.map((message) =>
          message.id === activeStreamingMessageId ? updater(message) : message,
        ),
      );
      if (resumeDraft?.assistantMessage.id === activeStreamingMessageId) {
        resumeDraft = {
          ...resumeDraft,
          assistantMessage: updater(resumeDraft.assistantMessage),
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

    async function resumeStream() {
      try {
        const res = await fetch(
          `/api/workspace/conversations/${activeConversationId}/stream`,
          { signal: controller.signal },
        );
        if (res.status === 404 || res.status === 409) {
          clearStoredChatStreamDraft(activeConversationId);
          await reloadConversationMessages();
          await onConversationsRefresh();
          return;
        }
        if (!res.ok) {
          const error = await res.json().catch(() => null);
          throw new Error(error?.error || "Failed to resume chat stream");
        }
        if (!res.body) {
          throw new Error("Failed to resume chat stream");
        }

        updateAssistant((message) => ({ ...message, parts: [] }));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        function handleStreamEvent(eventText: string) {
          const parsed = parseStreamEventText(eventText);
          if (!parsed) return;
          applyStreamEvent(parsed, {
            updateAssistant,
            addPendingApproval,
            clearPendingApprovals,
            setCitations,
            onDone: () => {
              completed = true;
              clearStoredChatStreamDraft(activeConversationId);
            },
          });
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const streamEvent of events) {
            handleStreamEvent(streamEvent);
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) handleStreamEvent(buffer);

        if (!controller.signal.aborted) {
          if (completed) {
            await onConversationsRefresh();
          } else {
            await reloadConversationMessages();
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const errorMessage =
          err instanceof Error ? err.message : "Chat stream failed";
        toast.error(compactErrorMessage(errorMessage));
        updateAssistant((message) => appendErrorPart(message, errorMessage));
        clearPendingApprovals();
        clearStoredChatStreamDraft(activeConversationId);
      } finally {
        cancelScheduledResumeDraftWrite();
        if (activeRequestControllerRef.current === controller) {
          activeRequestControllerRef.current = null;
          activeConversationIdRef.current = null;
        }
        if (!controller.signal.aborted) setResuming(false);
      }
    }

    void resumeStream();
    return () => {
      controller.abort();
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null;
        activeConversationIdRef.current = null;
      }
      queueMicrotask(() => setResuming(false));
    };
  }, [
    conversationId,
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
