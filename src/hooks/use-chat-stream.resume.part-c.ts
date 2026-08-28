import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import type {
  ChatCitation,
  ChatMessage,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import {
  applyStreamEvent,
  clearStoredChatStreamDraft,
  parseStreamEventText,
} from "@/hooks/use-chat-stream-events";
import { notifyConversationStreaming } from "@/lib/workspace-history-events";
import {
  appendErrorPart,
  compactErrorMessage,
} from "./use-chat-stream.compact-error-message";
import {
  DEFAULT_RESUME_RETRY_MS,
  waitForAbortableResumeDelay,
  waitForChatResumeSource,
} from "./use-chat-stream.resume.part-a";

export type ChatStreamResumeContext = {
  workspaceId: string | null;
  activeConversationId: string;
  activeStreamingMessageId: string;
  controller: AbortController;
  reloadConversationMessages: (
    signal: AbortSignal,
  ) => Promise<ChatMessage[] | null>;
  setCitations: Dispatch<SetStateAction<ChatCitation[]>>;
  updateAssistant: (updater: (message: ChatMessage) => ChatMessage) => void;
  addPendingApproval: (approval: PendingToolApproval) => void;
  clearPendingApprovals: () => void;
  refreshDirectory: () => void;
  cleanupOnce: () => void;
};

export function runChatStreamResumeSession(
  context: ChatStreamResumeContext,
): () => void {
  const {
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
  } = context;
  let terminalConfirmed = false;

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
        notifyConversationStreaming(workspaceId, activeConversationId, false, {
          markUnread: false,
        });
      }
      cleanupOnce();
    }
  }

  void runResumeLoop();
  return () => {
    controller.abort();
    cleanupOnce();
  };
}
