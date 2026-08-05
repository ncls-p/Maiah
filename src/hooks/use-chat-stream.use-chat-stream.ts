"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { toolNameMatches, type ChatCitation, type ChatMessage, type PendingToolApproval } from "@/components/chat/chat-types";

import { STREAM_DRAFT_EVENT, TOOL_CALL_PART_TYPE, approvalsFromDraft, clearStoredChatStreamDraft, filterResolvedApprovals, getStoredChatStreamDraft, mergeStoredDraft, removePendingApproval, storeChatStreamDraft, type StoredChatStreamDraft } from "@/hooks/use-chat-stream-events";
import { UseChatStreamOptions } from "./use-chat-stream.compact-error-message";
import { useChatStreamResume } from "./use-chat-stream.resume";
import { useChatSubmitHandler } from "./use-chat-stream.submit";

export function useChatStream({ agentId, conversationId, workspaceId, canChat, onConversationCreated, onConversationTitle, onConversationsRefresh }: UseChatStreamOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingToolApproval[]>([]);
  const [citations, setCitations] = useState<ChatCitation[]>([]);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const detachedRequestControllersRef = useRef<WeakSet<AbortController>>(new WeakSet());
  const stopRequestedRef = useRef(false);
  const resolvedApprovalIdsRef = useRef(new Set<string>());
  const streamingMessageId = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === "assistant" && message.status === "streaming")?.id ?? null;
  }, [messages]);

  const detachActiveStream = useCallback(() => {
    const controller = activeRequestControllerRef.current;
    if (!controller || controller.signal.aborted) return;
    detachedRequestControllersRef.current.add(controller);
    controller.abort();
    activeRequestControllerRef.current = null;
    activeConversationIdRef.current = null;
    stopRequestedRef.current = false;
    setSending(false);
    setResuming(false);
    setPendingApprovals([]);
  }, []);

  const setMessagesDirect = useCallback(
    (next: ChatMessage[]) => {
      if (next.length === 0 || !conversationId) {
        resolvedApprovalIdsRef.current.clear();
        setMessages(next);
        setCitations([]);
        setPendingApprovals([]);
        return;
      }

      const draft = getStoredChatStreamDraft(conversationId);
      setMessages(mergeStoredDraft(next, draft));
      setCitations([]);
      setPendingApprovals(filterResolvedApprovals(approvalsFromDraft(draft), resolvedApprovalIdsRef.current));
    },
    [conversationId],
  );

  useEffect(() => {
    const activeStreamConversationId = activeConversationIdRef.current;
    if (!activeRequestControllerRef.current) return;
    if (!activeStreamConversationId && !conversationId) return;
    if (activeStreamConversationId === conversationId) return;
    detachActiveStream();
  }, [conversationId, detachActiveStream]);

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
      setPendingApprovals(filterResolvedApprovals(approvalsFromDraft(detail.draft), resolvedApprovalIdsRef.current));
    }

    window.addEventListener(STREAM_DRAFT_EVENT, handleDraftEvent);
    return () => {
      window.removeEventListener(STREAM_DRAFT_EVENT, handleDraftEvent);
    };
  }, [conversationId]);

  useEffect(() => {
    if (!workspaceId || !conversationId) return;
    const draft = getStoredChatStreamDraft(conversationId);
    const draftApprovals = filterResolvedApprovals(approvalsFromDraft(draft), resolvedApprovalIdsRef.current);
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
      const res = await fetch(`/api/workspace/tool-invocations?${params.toString()}`);
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
  }, [workspaceId, conversationId]);

  const reloadConversationMessages = useCallback(async () => {
    if (!conversationId) return;
    const res = await fetch(`/api/workspace/conversations/${conversationId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { messages?: ChatMessage[] };
    setMessages(data.messages ?? []);
  }, [conversationId]);

  useChatStreamResume({ conversationId, streamingMessageId, sending, reloadConversationMessages, onConversationsRefresh, setMessages, setPendingApprovals, setCitations, setResuming, activeRequestControllerRef, activeConversationIdRef, resolvedApprovalIdsRef });

  const handleSubmit = useChatSubmitHandler({ agentId, conversationId, canChat, sending, messages, onConversationCreated, onConversationTitle, onConversationsRefresh, setMessages, setSending, setPendingApprovals, setCitations, activeRequestControllerRef, activeConversationIdRef, detachedRequestControllersRef, stopRequestedRef, resolvedApprovalIdsRef });

  const stopGeneration = useCallback(async () => {
    if (stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    activeRequestControllerRef.current?.abort();

    const targetConversationId = activeConversationIdRef.current ?? conversationId;
    if (targetConversationId) {
      try {
        await fetch(`/api/workspace/conversations/${targetConversationId}/stop`, {
          method: "POST",
        });
      } catch {
        toast.error("Stopped locally, but the server did not acknowledge the stop request.");
      }
      clearStoredChatStreamDraft(targetConversationId);
    }

    setMessages((current) => current.map((message) => (message.role === "assistant" && message.status === "streaming" ? { ...message, status: "completed" } : message)));
    setPendingApprovals([]);
    setSending(false);
    setResuming(false);
    toast.success("Generation stopped");
  }, [conversationId]);

  const resolveApproval = useCallback(
    async (action: "approve" | "reject", invocationId: string) => {
      const approval = pendingApprovals.find((item) => item.invocationId === invocationId);
      if (!approval) return;
      const endpoint = action === "approve" ? `/api/workspace/tool-invocations/${approval.invocationId}/approve` : `/api/workspace/tool-invocations/${approval.invocationId}/reject`;

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
      setPendingApprovals((current) => removePendingApproval(current, approval.invocationId));

      // When rejecting, mark only the matching tool-call part as denied so it
      // displays in red while avoiding unrelated calls with the same name.
      if (action === "reject") {
        setMessages((current) =>
          current.map((message) => {
            const nextParts = message.parts.map((part) => {
              if (part.type !== TOOL_CALL_PART_TYPE) return part;
              try {
                const parsed = JSON.parse(part.content) as Record<string, unknown>;
                const inputMatches = parsed.input === undefined || JSON.stringify(parsed.input) === JSON.stringify(approval.input);
                if (inputMatches && toolNameMatches(parsed.toolName as string | undefined, approval.toolName)) {
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
          const nextApprovals = removePendingApproval(approvalsFromDraft(draft), approval.invocationId);
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
      toast.success(action === "approve" ? "Tool approved" : "Tool invocation rejected");
    },
    [conversationId, pendingApprovals],
  );

  return {
    messages,
    setMessages: setMessagesDirect,
    sending: sending || resuming,
    pendingApprovals,
    citations,
    handleSubmit,
    resolveApproval,
    stopGeneration,
    detachActiveStream,
    clearPendingApprovals: () => setPendingApprovals([]),
  };
}
