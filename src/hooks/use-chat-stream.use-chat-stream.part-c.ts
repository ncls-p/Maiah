import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { toast } from "sonner";
import {
  toolNameMatches,
  type ChatMessage,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import {
  TOOL_CALL_PART_TYPE,
  approvalsFromDraft,
  clearStoredChatStreamDraft,
  getStoredChatStreamDraft,
  removePendingApproval,
  storeChatStreamDraft,
} from "@/hooks/use-chat-stream-events";
import {
  notifyConversationStreaming,
  notifyWorkspaceHistoryChanged,
} from "@/lib/workspace-history-events";
import {
  cancelScopedStreamingMessage,
  chatStreamOperationOwnsVisibleState,
} from "./use-chat-stream.operation-scope";

export type PendingStopOperation = {
  conversationId: string;
  messageId: string | null;
  generationId: string | null;
  requestController: AbortController | null;
  reloadController: AbortController;
};

export async function stopChatGeneration(input: {
  conversationId: string | null;
  streamingMessageId: string | null;
  streamingGenerationId: string | null;
  workspaceId: string | null;
  stopRequestedRef: MutableRefObject<boolean>;
  activeRequestControllerRef: MutableRefObject<AbortController | null>;
  activeConversationIdRef: MutableRefObject<string | null>;
  visibleConversationIdRef: MutableRefObject<string | null>;
  stopOperationRef: MutableRefObject<PendingStopOperation | null>;
  cancelPendingStopOperation: () => void;
  reloadConversationMessages: (
    signal: AbortSignal,
  ) => Promise<ChatMessage[] | null>;
  onConversationsRefresh: () => Promise<void>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setPendingApprovals: Dispatch<SetStateAction<PendingToolApproval[]>>;
  setSending: Dispatch<SetStateAction<boolean>>;
  setResuming: Dispatch<SetStateAction<boolean>>;
}): Promise<void> {
  const {
    conversationId,
    streamingMessageId,
    streamingGenerationId,
    workspaceId,
    stopRequestedRef,
    activeRequestControllerRef,
    activeConversationIdRef,
    visibleConversationIdRef,
    stopOperationRef,
    cancelPendingStopOperation,
    reloadConversationMessages,
    onConversationsRefresh,
    setMessages,
    setPendingApprovals,
    setSending,
    setResuming,
  } = input;

  if (stopRequestedRef.current) return;
  const targetConversationId =
    activeConversationIdRef.current ?? conversationId;
  if (!targetConversationId) return;

  stopRequestedRef.current = true;
  const operation: PendingStopOperation = {
    conversationId: targetConversationId,
    messageId: streamingMessageId,
    generationId: streamingGenerationId,
    requestController: activeRequestControllerRef.current,
    reloadController: new AbortController(),
  };
  cancelPendingStopOperation();
  stopOperationRef.current = operation;
  operation.requestController?.abort();
  notifyConversationStreaming(workspaceId, targetConversationId, false, {
    markUnread: false,
  });

  let serverAcknowledged = false;
  try {
    const response = await fetch(
      `/api/workspace/conversations/${targetConversationId}/stop`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: operation.generationId
            ? (operation.messageId ?? undefined)
            : undefined,
          generationId: operation.generationId ?? undefined,
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      stopped?: boolean;
    } | null;
    if (!response.ok || payload?.stopped !== true) {
      throw new Error("Stop request was not acknowledged for this generation");
    }
    serverAcknowledged = true;
  } catch {
    toast.error(
      "Stopped locally, but the server did not acknowledge the stop request.",
    );
  }

  if (serverAcknowledged) {
    if (
      stopOperationRef.current === operation &&
      visibleConversationIdRef.current === targetConversationId
    ) {
      try {
        await reloadConversationMessages(operation.reloadController.signal);
      } catch {
        // The server already acknowledged the stop. Navigation aborts this
        // reload; the history poll recovers other transient failures.
      }
    }
    try {
      await onConversationsRefresh();
    } catch {
      // The workspace history has its own server-backed refresh loop.
    }
    notifyWorkspaceHistoryChanged(workspaceId);
  }

  const storedDraft = getStoredChatStreamDraft(targetConversationId);
  if (
    !storedDraft ||
    !operation.messageId ||
    storedDraft.assistantMessage.id === operation.messageId
  ) {
    clearStoredChatStreamDraft(targetConversationId);
  }

  const ownsVisibleState =
    stopOperationRef.current === operation &&
    chatStreamOperationOwnsVisibleState({
      currentConversationId: visibleConversationIdRef.current,
      targetConversationId,
      currentRequestController: activeRequestControllerRef.current,
      targetRequestController: operation.requestController,
    });
  if (ownsVisibleState) {
    setMessages((current) =>
      cancelScopedStreamingMessage(current, {
        messageId: operation.messageId,
        generationId: operation.generationId,
      }),
    );
    setPendingApprovals([]);
    setSending(false);
    setResuming(false);
  }
  if (stopOperationRef.current === operation) {
    stopOperationRef.current = null;
    stopRequestedRef.current = false;
  }
  toast.success("Generation stopped");
}

export async function resolveChatApproval(input: {
  action: "approve" | "reject";
  invocationId: string;
  conversationId: string | null;
  pendingApprovals: PendingToolApproval[];
  resolvedApprovalIdsRef: MutableRefObject<Set<string>>;
  setPendingApprovals: Dispatch<SetStateAction<PendingToolApproval[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}): Promise<void> {
  const {
    action,
    invocationId,
    conversationId,
    pendingApprovals,
    resolvedApprovalIdsRef,
    setPendingApprovals,
    setMessages,
  } = input;

  const approval = pendingApprovals.find(
    (item) => item.invocationId === invocationId,
  );
  if (!approval) return;
  const endpoint =
    action === "approve"
      ? `/api/workspace/tool-invocations/${approval.invocationId}/approve`
      : `/api/workspace/tool-invocations/${approval.invocationId}/reject`;

  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST" });
  } catch {
    toast.error(`Failed to ${action} tool invocation`);
    return;
  }
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    toast.error(error?.error || `Failed to ${action} tool invocation`);
    return;
  }
  resolvedApprovalIdsRef.current.add(approval.invocationId);
  setPendingApprovals((current) =>
    removePendingApproval(current, approval.invocationId),
  );

  // When rejecting, mark only the matching tool-call part as denied so it
  // displays in red while avoiding unrelated calls with the same name.
  if (action === "reject") {
    setMessages((current) =>
      current.map((message) => {
        const nextParts = message.parts.map((part) => {
          if (part.type !== TOOL_CALL_PART_TYPE) return part;
          try {
            const parsed = JSON.parse(part.content) as Record<string, unknown>;
            const inputMatches =
              parsed.input === undefined ||
              JSON.stringify(parsed.input) === JSON.stringify(approval.input);
            if (
              inputMatches &&
              toolNameMatches(
                parsed.toolName as string | undefined,
                approval.toolName,
              )
            ) {
              return {
                type: part.type,
                content: JSON.stringify({ ...parsed, denied: true }),
              };
            }
          } catch {
            // skip unparsable parts
          }
          return part;
        });
        return { ...message, parts: nextParts };
      }),
    );
  }

  if (conversationId) {
    const draft = getStoredChatStreamDraft(conversationId);
    if (draft) {
      const nextApprovals = removePendingApproval(
        approvalsFromDraft(draft),
        approval.invocationId,
      );
      storeChatStreamDraft(
        {
          ...draft,
          pendingApprovals: nextApprovals,
          pendingApproval: nextApprovals[0] ?? null,
          updatedAt: Date.now(),
        },
        { notify: false },
      );
    }
  }
  toast.success(
    action === "approve" ? "Tool approved" : "Tool invocation rejected",
  );
}
