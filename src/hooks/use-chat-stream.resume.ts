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
import { notifyConversationStreaming } from "@/lib/workspace-history-events";
import {
  appendErrorPart,
  compactErrorMessage,
} from "./use-chat-stream.compact-error-message";

const DEFAULT_RESUME_RETRY_MS = 2_000;
const MIN_RESUME_RETRY_MS = 500;
const MAX_RESUME_RETRY_MS = 5_000;
const MAX_RESUME_RELOAD_ATTEMPTS = 5;

function abortError() {
  return new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

export function waitForAbortableResumeDelay(
  signal: AbortSignal,
  delayMs: number,
) {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const timeoutId = setTimeout(() => finish(resolve), delayMs);

    signal.addEventListener("abort", onAbort, { once: true });
    // Cover an abort racing the listener registration.
    if (signal.aborted) onAbort();
  });
}

export function chatStreamMessageIsActive(
  messages: ChatMessage[],
  messageId: string,
) {
  return messages.some(
    (message) =>
      message.id === messageId &&
      (message.status === "pending" || message.status === "streaming"),
  );
}

type ResumeSource =
  | { kind: "stream"; response: Response }
  | { kind: "terminal"; messages: ChatMessage[] };

export async function waitForChatResumeSource(input: {
  signal: AbortSignal;
  messageId: string;
  requestStream: (signal: AbortSignal) => Promise<Response>;
  reloadMessages: (signal: AbortSignal) => Promise<ChatMessage[] | null>;
  wait?: (signal: AbortSignal, delayMs: number) => Promise<void>;
}): Promise<ResumeSource> {
  const wait = input.wait ?? waitForAbortableResumeDelay;

  async function reloadUntilAvailable() {
    for (let attempt = 1; attempt <= MAX_RESUME_RELOAD_ATTEMPTS; attempt += 1) {
      throwIfAborted(input.signal);
      let messages: ChatMessage[] | null = null;
      try {
        messages = await input.reloadMessages(input.signal);
      } catch (error) {
        if (
          input.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          throw abortError();
        }
      }
      throwIfAborted(input.signal);
      if (messages !== null) return messages;
      if (attempt < MAX_RESUME_RELOAD_ATTEMPTS) {
        await wait(input.signal, DEFAULT_RESUME_RETRY_MS);
      }
    }

    throw new Error("Failed to reload conversation while resuming chat stream");
  }

  while (true) {
    throwIfAborted(input.signal);
    const response = await input.requestStream(input.signal);
    throwIfAborted(input.signal);

    if (response.status === 202) {
      const pending = (await response.json().catch(() => null)) as {
        retryAfterMs?: number;
      } | null;
      throwIfAborted(input.signal);
      const retryAfterMs = Math.min(
        MAX_RESUME_RETRY_MS,
        Math.max(
          MIN_RESUME_RETRY_MS,
          pending?.retryAfterMs ?? DEFAULT_RESUME_RETRY_MS,
        ),
      );
      await wait(input.signal, retryAfterMs);
      const messages = await reloadUntilAvailable();
      if (!chatStreamMessageIsActive(messages, input.messageId)) {
        return { kind: "terminal", messages };
      }
      continue;
    }

    if (response.status === 404 || response.status === 409) {
      const messages = await reloadUntilAvailable();
      if (!chatStreamMessageIsActive(messages, input.messageId)) {
        return { kind: "terminal", messages };
      }
      await wait(input.signal, DEFAULT_RESUME_RETRY_MS);
      continue;
    }

    return { kind: "stream", response };
  }
}

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
    let terminalConfirmed = false;
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

    async function consumeStream(response: Response) {
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to resume chat stream");
      }
      if (!response.body) throw new Error("Failed to resume chat stream");

      let completed = false;
      updateAssistant((message) => ({ ...message, parts: [] }));
      const reader = response.body.getReader();
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
            terminalConfirmed = true;
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
        for (const streamEvent of events) handleStreamEvent(streamEvent);
      }

      buffer += decoder.decode();
      if (buffer.trim()) handleStreamEvent(buffer);
      return completed;
    }

    async function runResumeLoop() {
      try {
        while (!controller.signal.aborted) {
          const source = await waitForChatResumeSource({
            signal: controller.signal,
            messageId: activeStreamingMessageId,
            requestStream: (signal) =>
              fetch(
                `/api/workspace/conversations/${activeConversationId}/stream`,
                { signal },
              ),
            reloadMessages: reloadConversationMessages,
          });

          if (source.kind === "terminal") {
            terminalConfirmed = true;
            clearPendingApprovals();
            clearStoredChatStreamDraft(activeConversationId);
            refreshDirectory();
            return;
          }

          if (await consumeStream(source.response)) {
            refreshDirectory();
            return;
          }
          await waitForAbortableResumeDelay(
            controller.signal,
            DEFAULT_RESUME_RETRY_MS,
          );
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
        if (!controller.signal.aborted && terminalConfirmed) {
          notifyConversationStreaming(
            workspaceId,
            activeConversationId,
            false,
            { markUnread: false },
          );
        }
        cleanupOnce();
      }
    }

    void runResumeLoop();
    return () => {
      controller.abort();
      cleanupOnce();
    };
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
