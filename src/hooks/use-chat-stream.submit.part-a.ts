import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  createLocalMessage,
  prepareAssistantMessageContinuation,
  type ChatCitation,
  type ChatMessage,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import {
  type SubmitOptions,
  type UseChatStreamOptions,
} from "./use-chat-stream.compact-error-message";
import { createChatSubmitSession } from "./use-chat-stream.submit.part-b";

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
