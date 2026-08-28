import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import type {
  ChatMessage,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import {
  STREAM_DRAFT_EVENT,
  approvalsFromDraft,
  filterResolvedApprovals,
  getStoredChatStreamDraft,
  mergeStoredDraft,
  type StoredChatStreamDraft,
} from "@/hooks/use-chat-stream-events";

export function useChatStreamDraftSync(input: {
  workspaceId: string | null;
  conversationId: string | null;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setPendingApprovals: Dispatch<SetStateAction<PendingToolApproval[]>>;
  resolvedApprovalIdsRef: MutableRefObject<Set<string>>;
}) {
  const {
    workspaceId,
    conversationId,
    setMessages,
    setPendingApprovals,
    resolvedApprovalIdsRef,
  } = input;

  useEffect(() => {
    if (!conversationId) return;

    function handleDraftEvent(event: Event) {
      const detail = (
        event as CustomEvent<{
          conversationId?: string;
          draft?: StoredChatStreamDraft | null;
        }>
      ).detail;
      if (detail?.conversationId !== conversationId) return;
      if (!detail.draft) {
        setPendingApprovals([]);
        return;
      }

      setMessages((current) => mergeStoredDraft(current, detail.draft ?? null));
      setPendingApprovals(
        filterResolvedApprovals(
          approvalsFromDraft(detail.draft),
          resolvedApprovalIdsRef.current,
        ),
      );
    }

    window.addEventListener(STREAM_DRAFT_EVENT, handleDraftEvent);
    return () => {
      window.removeEventListener(STREAM_DRAFT_EVENT, handleDraftEvent);
    };
  }, [
    conversationId,
    setMessages,
    setPendingApprovals,
    resolvedApprovalIdsRef,
  ]);

  useEffect(() => {
    if (!workspaceId || !conversationId) return;
    const draft = getStoredChatStreamDraft(conversationId);
    const draftApprovals = filterResolvedApprovals(
      approvalsFromDraft(draft),
      resolvedApprovalIdsRef.current,
    );
    if (draftApprovals.length > 0) {
      queueMicrotask(() => setPendingApprovals(draftApprovals));
      return;
    }

    let cancelled = false;
    async function loadPendingApproval() {
      const params = new URLSearchParams({
        workspaceId: workspaceId ?? "",
        status: "awaiting_approval",
        limit: "10",
        conversationId: conversationId ?? "",
      });
      const res = await fetch(
        `/api/workspace/tool-invocations?${params.toString()}`,
      );
      if (!res.ok) return;
      const invocations = (await res.json()) as Array<{
        id: string;
        toolName: string;
        input: unknown;
      }>;
      if (cancelled) return;
      setPendingApprovals(
        filterResolvedApprovals(
          invocations.map((invocation) => ({
            invocationId: invocation.id,
            toolName: invocation.toolName,
            input: invocation.input,
          })),
          resolvedApprovalIdsRef.current,
        ),
      );
    }

    void loadPendingApproval();
    return () => {
      cancelled = true;
    };
  }, [
    workspaceId,
    conversationId,
    setPendingApprovals,
    resolvedApprovalIdsRef,
  ]);
}
