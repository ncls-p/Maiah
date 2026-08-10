"use client";

import { useCallback } from "react";
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

import { latestCodeWorkspaceArtifact } from "./chat-page-helpers";

type Stream = ReturnType<typeof useChatStream>;
type Context = {
  activeConversationId: string | null;
  workspaceId: string | null | undefined;
  selectedAgentId: string | null;
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
  t: (key: string) => string;
};

export function useMessageActions(c: Context) {
  const { resolveApproval } = c;
  async function editMessage(message: ChatMessage, content: string) {
    if (!c.activeConversationId) return;
    const trimmed = content.trim();
    await fetchJson(
      `/api/workspace/conversations/${c.activeConversationId}/messages/${message.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      },
    );
    c.setMessages(
      c.messages.map((item) =>
        item.id === message.id
          ? {
              ...item,
              status: "completed",
              parts: [
                { type: "text", content: trimmed },
                ...item.parts.filter((part) => part.type === "file"),
              ],
            }
          : item,
      ),
    );
    if (message.role === "user" && trimmed && !c.sending)
      await c.handleSubmit(trimmed, {
        resendFromMessageId: message.id,
        reuseUserMessage: true,
      });
  }
  async function deleteMessage(message: ChatMessage) {
    if (!c.activeConversationId) return;
    await fetchJson(
      `/api/workspace/conversations/${c.activeConversationId}/messages/${message.id}`,
      { method: "DELETE" },
    );
    c.setMessages(c.messages.filter((item) => item.id !== message.id));
    await c.refreshConversations();
  }
  async function resendMessage(message: ChatMessage) {
    if (!c.activeConversationId || c.sending) return;
    const content = textFromMessage(message).trim();
    if (content)
      await c.handleSubmit(content, {
        resendFromMessageId: message.id,
        reuseUserMessage: true,
      });
  }
  async function continueAssistantResponse(message: ChatMessage) {
    if (!c.activeConversationId || c.sending) await Promise.resolve();
    else
      await c.handleSubmit(c.t("messageList.continuePrompt"), {
        continueFromMessageId: message.id,
      });
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
    resendMessage,
    continueAssistantResponse,
    reloadActualLatestMessages,
    reloadAgentContext,
    approveToolInvocation,
    rejectToolInvocation,
  };
}
