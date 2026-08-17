import type { ChatMessage } from "@/components/chat/chat-types";

type ConversationMessagesResponse = { messages?: ChatMessage[] };

export async function reloadConversationMessagesForScope(input: {
  conversationId: string;
  signal: AbortSignal;
  currentConversationId: () => string | null;
  commit: (messages: ChatMessage[]) => void;
  fetcher?: typeof fetch;
}) {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(
    `/api/workspace/conversations/${input.conversationId}`,
    { signal: input.signal },
  );
  if (!response.ok) return null;

  const payload = (await response.json()) as ConversationMessagesResponse;
  const messages = payload.messages ?? [];
  if (
    input.signal.aborted ||
    input.currentConversationId() !== input.conversationId
  ) {
    return null;
  }

  input.commit(messages);
  return messages;
}

export function chatStreamOperationOwnsVisibleState(input: {
  currentConversationId: string | null;
  targetConversationId: string;
  currentRequestController: AbortController | null;
  targetRequestController: AbortController | null;
}) {
  return Boolean(
    input.currentConversationId === input.targetConversationId &&
    (input.currentRequestController === null ||
      input.currentRequestController === input.targetRequestController),
  );
}

export function cancelScopedStreamingMessage(
  messages: ChatMessage[],
  target: { messageId: string | null; generationId: string | null },
) {
  return messages.map((message) => {
    if (message.role !== "assistant" || message.status !== "streaming") {
      return message;
    }
    if (target.messageId && message.id !== target.messageId) return message;
    if (
      target.generationId &&
      message.streamGenerationId !== target.generationId
    ) {
      return message;
    }
    return { ...message, status: "cancelled" as const };
  });
}
