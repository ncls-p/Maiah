import { toast } from "sonner";
import {
  migrateDraftCapabilityOverrides,
  readChatCapabilityOverrides,
} from "@/components/chat/chat-capability-overrides";
import type {
  ChatMessage,
  ChatStreamEvent,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import { streamAiSdkUIChat } from "@/hooks/ai-sdk-ui-chat-transport";
import {
  applyStreamEvent,
  clearStoredChatStreamDraft,
} from "@/hooks/use-chat-stream-events";
import { notifyConversationStreaming } from "@/lib/workspace-history-events";
import {
  appendErrorPart,
  compactErrorMessage,
} from "./use-chat-stream.compact-error-message";
import type {
  ChatSubmitSessionInput,
  ChatSubmitSessionState,
} from "./use-chat-stream.submit.part-b";

export function createChatSubmitRun(
  input: ChatSubmitSessionInput,
  state: ChatSubmitSessionState,
  api: {
    updateAssistantDraft: (
      updater: (message: ChatMessage) => ChatMessage,
    ) => void;
    addPendingApproval: (approval: PendingToolApproval) => void;
    clearPendingApprovals: () => void;
    flushAssistantRender: () => void;
    persistDraft: (options?: { immediate?: boolean }) => void;
    cancelScheduledDraftWrite: () => void;
    cancelScheduledRender: () => void;
  },
): (controller: AbortController) => Promise<boolean> {
  const {
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
    setMessages,
    setSending,
    setCitations,
    onConversationTitle,
    onConversationMetadata,
    onConversationCreated,
    onConversationsRefresh,
  } = input;

  return async (controller: AbortController) => {
    function handleStreamEvent(parsed: ChatStreamEvent) {
      applyStreamEvent(parsed, {
        updateAssistant: api.updateAssistantDraft,
        addPendingApproval: api.addPendingApproval,
        clearPendingApprovals: api.clearPendingApprovals,
        setCitations,
        onConversationTitle: (title) => {
          const targetConversationId = activeConversationIdRef.current;
          if (targetConversationId) {
            onConversationTitle?.(targetConversationId, title);
          }
        },
      });
    }

    try {
      const attachmentsToSend = options.attachments ?? [];
      await streamAiSdkUIChat({
        api: `/api/workspace/${agentId}/chat`,
        chatId: state.activeConversationId ?? userMessage.id,
        content,
        localUserMessageId: userMessage.id,
        resendFromMessageId: options.resendFromMessageId,
        body: {
          content,
          conversationId: conversationId ?? undefined,
          ephemeral: options.ephemeral,
          ephemeralTtlMinutes: options.ephemeralTtlMinutes,
          reasoningEffort: options.reasoningEffort,
          resendFromMessageId: options.resendFromMessageId,
          regenerateAssistantMessageId: options.regenerateAssistantMessageId,
          continueFromMessageId: options.continueFromMessageId,
          codeWorkspaceId:
            options.codeWorkspaceId ?? options.codeWorkspaceArtifact?.projectId,
          attachmentIds: attachmentsToSend.flatMap((attachment) =>
            attachment.kind === "chat_file" ? [attachment.id] : [],
          ),
          imageAttachmentIds: attachmentsToSend.flatMap((attachment) =>
            attachment.kind === "chat_image" ? [attachment.id] : [],
          ),
          capabilityOverrides: readChatCapabilityOverrides(
            agentId,
            conversationId,
          ),
        },
        abortSignal: controller.signal,
        onStart: (metadata) => {
          onConversationMetadata?.(metadata);
          if (options.regenerateAssistantMessageId && metadata.conversationId) {
            const conversationIds = Array.from(
              new Set([
                ...(options.responseVersionConversationIds ??
                  (conversationId ? [conversationId] : [])),
                metadata.conversationId,
              ]),
            );
            state.assistantDraft = {
              ...state.assistantDraft,
              branch: {
                conversationIds,
                activeIndex: conversationIds.indexOf(metadata.conversationId),
              },
            };
          }
          if (metadata.conversationId) {
            state.activeConversationId = metadata.conversationId;
            activeConversationIdRef.current = metadata.conversationId;
            notifyConversationStreaming(
              workspaceId,
              metadata.conversationId,
              true,
            );
          }
          if (metadata.messageId) {
            state.assistantMessageId = metadata.messageId;
            state.assistantDraft = {
              ...state.assistantDraft,
              id: metadata.messageId,
              streamGenerationId: metadata.streamGenerationId,
            };
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id
                  ? state.assistantDraft
                  : message,
              ),
            );
            api.persistDraft({ immediate: true });
          }
          if (metadata.userMessageId) {
            setMessages((current) =>
              current.map((message) =>
                message.id === userMessage.id ||
                (options.reuseUserMessage &&
                  message.id === options.resendFromMessageId)
                  ? { ...message, id: metadata.userMessageId! }
                  : message,
              ),
            );
          }
          if (
            metadata.conversationId &&
            metadata.conversationId !== conversationId
          ) {
            migrateDraftCapabilityOverrides(agentId, metadata.conversationId);
            onConversationCreated(metadata.conversationId, content, {
              responseVersion: Boolean(options.regenerateAssistantMessageId),
            });
          }
        },
        onEvent: handleStreamEvent,
      });

      api.updateAssistantDraft((message) => ({
        ...message,
        status: "completed",
      }));
      api.flushAssistantRender();
      api.clearPendingApprovals();
      if (state.activeConversationId)
        clearStoredChatStreamDraft(state.activeConversationId);
      notifyConversationStreaming(
        workspaceId,
        state.activeConversationId,
        false,
        {
          markUnread: false,
        },
      );

      await onConversationsRefresh().catch(() => undefined);
      return true;
    } catch (err) {
      const requestWasDetached =
        detachedRequestControllersRef.current.has(controller);
      if (err instanceof Error && err.name === "AbortError") {
        if (requestWasDetached) {
          api.persistDraft({ immediate: true });
          return true;
        }
        api.updateAssistantDraft((message) => ({
          ...message,
          status: stopRequestedRef.current ? "cancelled" : "completed",
        }));
        api.flushAssistantRender();
        api.clearPendingApprovals();
        if (state.activeConversationId)
          clearStoredChatStreamDraft(state.activeConversationId);
        notifyConversationStreaming(
          workspaceId,
          state.activeConversationId,
          false,
          {
            markUnread: false,
          },
        );
        return false;
      }
      const errorMessage =
        err instanceof Error ? err.message : "Chat request failed";
      toast.error(compactErrorMessage(errorMessage));
      api.updateAssistantDraft((message) =>
        options.continueFromMessageId
          ? { ...message, status: "completed" }
          : appendErrorPart(message, errorMessage),
      );
      api.flushAssistantRender();
      api.clearPendingApprovals();
      if (state.activeConversationId)
        clearStoredChatStreamDraft(state.activeConversationId);
      notifyConversationStreaming(
        workspaceId,
        state.activeConversationId,
        false,
        {
          markUnread: false,
        },
      );
      return false;
    } finally {
      const requestWasDetached =
        detachedRequestControllersRef.current.has(controller);
      if (!requestWasDetached) api.flushAssistantRender();
      api.cancelScheduledDraftWrite();
      api.cancelScheduledRender();
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null;
        activeConversationIdRef.current = null;
      }
      if (!requestWasDetached) {
        stopRequestedRef.current = false;
        setSending(false);
      }
    }
  };
}
