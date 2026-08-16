"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import type {
  AgentVersion,
  ChatMessage,
  CodeWorkspaceArtifact,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import { textFromMessage } from "@/components/chat/chat-types";
import type { useChatStream } from "@/hooks/use-chat-stream";
import { fetchJson } from "@/lib/api-client";
import type { ReasoningPreset } from "@/modules/agent/reasoning-presets";

import { latestCodeWorkspaceArtifact } from "./chat-page-helpers";

type Stream = ReturnType<typeof useChatStream>;
type Context = {
  activeConversationId: string | null;
  workspaceId: string | null | undefined;
  selectedAgentId: string | null;
  reasoningEffort: ReasoningPreset | null;
  messages: ChatMessage[];
  sending: boolean;
  setMessages: Stream["setMessages"];
  handleSubmit: Stream["handleSubmit"];
  resolveApproval: Stream["resolveApproval"];
  refreshConversations: () => Promise<void>;
  loadAgentDirectory: (input?: {
    preferredAgentId?: string | null;
    signal?: AbortSignal;
  }) => Promise<string | null>;
  setCodeWorkspaceArtifact: (artifact: CodeWorkspaceArtifact | null) => void;
  setActiveVersion: (version: AgentVersion | null) => void;
  setLoadingContext: (loading: boolean) => void;
  selectConversation: (
    conversationId: string,
    conversationAgentId?: string | null,
  ) => void;
  t: (key: string) => string;
};

export function useMessageActions(c: Context) {
  const { resolveApproval } = c;
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
  async function restoreMessagesAfterFailure(fallback: ChatMessage[]) {
    if (!c.activeConversationId) {
      c.setMessages(fallback);
      c.setCodeWorkspaceArtifact(latestCodeWorkspaceArtifact(fallback));
      return fallback;
    }
    try {
      const data = await fetchJson<{ messages?: ChatMessage[] }>(
        `/api/workspace/conversations/${c.activeConversationId}`,
      );
      const restored = data.messages ?? fallback;
      c.setMessages(restored);
      c.setCodeWorkspaceArtifact(latestCodeWorkspaceArtifact(restored));
      return restored;
    } catch {
      c.setMessages(fallback);
      c.setCodeWorkspaceArtifact(latestCodeWorkspaceArtifact(fallback));
      return fallback;
    }
  }
  async function editMessage(message: ChatMessage, content: string) {
    if (!c.activeConversationId || c.sending) return false;
    const trimmed = content.trim();
    if (!trimmed) return false;
    const previousMessages = c.messages;
    const nextMessages = c.messages.map((item) =>
      item.id === message.id
        ? {
            ...item,
            status: "completed" as const,
            parts: [
              { type: "text" as const, content: trimmed },
              ...item.parts.filter((part) => part.type === "file"),
            ],
          }
        : item,
    );
    c.setMessages(nextMessages);
    if (message.role === "user") {
      const saved = await c.handleSubmit(trimmed, {
        resendFromMessageId: message.id,
        reuseUserMessage: true,
        reasoningEffort: c.reasoningEffort ?? undefined,
      });
      if (saved) return true;
      const restored = await restoreMessagesAfterFailure(previousMessages);
      return restored.some(
        (item) =>
          item.id === message.id && textFromMessage(item).trim() === trimmed,
      );
    }
    try {
      await fetchJson(
        `/api/workspace/conversations/${c.activeConversationId}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        },
      );
      return true;
    } catch (error) {
      c.setMessages(previousMessages);
      toast.error(
        error instanceof Error ? error.message : c.t("messageList.editFailed"),
      );
      return false;
    }
  }
  async function deleteMessage(message: ChatMessage) {
    if (!c.activeConversationId || c.sending) return false;
    try {
      const result = await fetchJson<{ deletedMessageIds?: string[] }>(
        `/api/workspace/conversations/${c.activeConversationId}/messages/${message.id}`,
        { method: "DELETE" },
      );
      const deletedIds = new Set(result.deletedMessageIds ?? [message.id]);
      const remaining = c.messages.filter((item) => !deletedIds.has(item.id));
      c.setMessages(remaining);
      c.setCodeWorkspaceArtifact(latestCodeWorkspaceArtifact(remaining));
      void c.refreshConversations().catch(() => undefined);
      toast.success(c.t("messageList.deleteSucceeded"));
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : c.t("messageList.deleteFailed"),
      );
      return false;
    }
  }
  async function regenerateAssistantResponse(message: ChatMessage) {
    if (!c.activeConversationId || c.sending) return;
    const messageIndex = c.messages.findIndex((item) => item.id === message.id);
    const precedingUserMessage = c.messages
      .slice(0, messageIndex)
      .findLast((item) => item.role === "user");
    if (!precedingUserMessage) return;
    const content = textFromMessage(precedingUserMessage).trim();
    if (!content) return;
    await c.handleSubmit(content, {
      resendFromMessageId: precedingUserMessage.id,
      regenerateAssistantMessageId: message.id,
      responseVersionConversationIds: message.branch?.conversationIds ?? [
        c.activeConversationId,
      ],
      reuseUserMessage: true,
      reasoningEffort: c.reasoningEffort ?? undefined,
    });
  }
  async function continueAssistantResponse(message: ChatMessage) {
    if (!c.activeConversationId || c.sending) await Promise.resolve();
    else
      await c.handleSubmit(c.t("messageList.continuePrompt"), {
        continueFromMessageId: message.id,
        reasoningEffort: c.reasoningEffort ?? undefined,
      });
  }
  async function forkConversation(message: ChatMessage) {
    if (!c.activeConversationId || c.sending || forkingMessageId) return;
    setForkingMessageId(message.id);
    try {
      const result = await fetchJson<{
        conversation: { id: string; agentId: string };
      }>(`/api/workspace/conversations/${c.activeConversationId}/forks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id }),
      });
      c.selectConversation(result.conversation.id, result.conversation.agentId);
      void c.refreshConversations().catch(() => undefined);
      toast.success(c.t("messageList.forkCreated"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : c.t("messageList.forkFailed"),
      );
    } finally {
      setForkingMessageId(null);
    }
  }
  async function reloadActualLatestMessages() {
    if (!c.activeConversationId || c.sending) return;
    const data = await fetchJson<{ messages?: ChatMessage[] }>(
      `/api/workspace/conversations/${c.activeConversationId}`,
    );
    const messages = data.messages ?? [];
    c.setMessages(messages);
    c.setCodeWorkspaceArtifact(latestCodeWorkspaceArtifact(messages));
  }
  async function reloadAgentContext() {
    if (!c.workspaceId) return;
    c.setLoadingContext(true);
    try {
      const agentId = await c.loadAgentDirectory({
        preferredAgentId: c.selectedAgentId,
      });
      if (!agentId || agentId !== c.selectedAgentId)
        return c.setActiveVersion(null);
      const versions = await fetchJson<AgentVersion[]>(
        `/api/workspace/agents/${agentId}/versions?workspaceId=${c.workspaceId}`,
      );
      c.setActiveVersion(versions.find(({ isActive }) => isActive) ?? null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : c.t("errors.reloadAgentFailed"),
      );
    } finally {
      c.setLoadingContext(false);
    }
  }
  const approveToolInvocation = useCallback(
    (approval: PendingToolApproval) =>
      void resolveApproval("approve", approval.invocationId),
    [resolveApproval],
  );
  const rejectToolInvocation = useCallback(
    (approval: PendingToolApproval) =>
      void resolveApproval("reject", approval.invocationId),
    [resolveApproval],
  );
  return {
    editMessage,
    deleteMessage,
    regenerateAssistantResponse,
    continueAssistantResponse,
    forkConversation,
    forkingMessageId,
    navigateConversationBranch: c.selectConversation,
    reloadActualLatestMessages,
    reloadAgentContext,
    approveToolInvocation,
    rejectToolInvocation,
  };
}
