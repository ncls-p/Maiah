"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatCitation,
  ChatMessage,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import {
  approvalsFromDraft,
  filterResolvedApprovals,
  getStoredChatStreamDraft,
  mergeStoredDraft,
} from "@/hooks/use-chat-stream-events";
import { UseChatStreamOptions } from "./use-chat-stream.compact-error-message";
import { reloadConversationMessagesForScope } from "./use-chat-stream.operation-scope";
import { useChatStreamResume } from "./use-chat-stream.resume";
import { useChatSubmitHandler } from "./use-chat-stream.submit";
import { useChatStreamDraftSync } from "./use-chat-stream.use-chat-stream.part-b";
import {
  resolveChatApproval,
  stopChatGeneration,
  type PendingStopOperation,
} from "./use-chat-stream.use-chat-stream.part-c";

export function useChatStream({
  agentId,
  conversationId,
  workspaceId,
  canChat,
  onConversationCreated,
  onConversationTitle,
  onConversationMetadata,
  onConversationsRefresh,
}: UseChatStreamOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<
    PendingToolApproval[]
  >([]);
  const [citations, setCitations] = useState<ChatCitation[]>([]);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const visibleConversationIdRef = useRef(conversationId);
  const stopOperationRef = useRef<PendingStopOperation | null>(null);
  const detachedRequestControllersRef = useRef<WeakSet<AbortController>>(
    new WeakSet(),
  );
  const stopRequestedRef = useRef(false);
  const resolvedApprovalIdsRef = useRef(new Set<string>());
  const streamingMessage = useMemo(() => {
    return (
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" && message.status === "streaming",
        ) ?? null
    );
  }, [messages]);
  const streamingMessageId = streamingMessage?.id ?? null;
  const streamingGenerationId = streamingMessage?.streamGenerationId ?? null;

  useEffect(() => {
    visibleConversationIdRef.current = conversationId;
  }, [conversationId]);

  const cancelPendingStopOperation = useCallback(() => {
    stopOperationRef.current?.reloadController.abort();
    stopOperationRef.current = null;
  }, []);

  const detachActiveStream = useCallback(() => {
    cancelPendingStopOperation();
    const controller = activeRequestControllerRef.current;
    if (controller) {
      detachedRequestControllersRef.current.add(controller);
      if (!controller.signal.aborted) controller.abort();
    }
    activeRequestControllerRef.current = null;
    activeConversationIdRef.current = null;
    visibleConversationIdRef.current = null;
    stopRequestedRef.current = false;
    setSending(false);
    setResuming(false);
    setPendingApprovals([]);
  }, [cancelPendingStopOperation]);

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
      setPendingApprovals(
        filterResolvedApprovals(
          approvalsFromDraft(draft),
          resolvedApprovalIdsRef.current,
        ),
      );
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

  useChatStreamDraftSync({
    workspaceId,
    conversationId,
    setMessages,
    setPendingApprovals,
    resolvedApprovalIdsRef,
  });

  const reloadConversationMessages = useCallback(
    async (signal: AbortSignal) => {
      if (!conversationId) return null;
      return reloadConversationMessagesForScope({
        conversationId,
        signal,
        currentConversationId: () => visibleConversationIdRef.current,
        commit: setMessages,
      });
    },
    [conversationId],
  );

  useChatStreamResume({
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
  });

  const handleSubmit = useChatSubmitHandler({
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
    onBeforeSubmit: cancelPendingStopOperation,
  });

  const stopGeneration = useCallback(async () => {
    await stopChatGeneration({
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
    });
  }, [
    cancelPendingStopOperation,
    conversationId,
    onConversationsRefresh,
    reloadConversationMessages,
    streamingGenerationId,
    streamingMessageId,
    workspaceId,
  ]);

  const resolveApproval = useCallback(
    async (action: "approve" | "reject", invocationId: string) => {
      await resolveChatApproval({
        action,
        invocationId,
        conversationId,
        pendingApprovals,
        resolvedApprovalIdsRef,
        setPendingApprovals,
        setMessages,
      });
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
