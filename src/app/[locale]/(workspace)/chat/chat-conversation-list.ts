import type {
  ChatConversation,
  ChatConversationFolder,
} from "@/components/chat/chat-types";

export type ConversationListPage = {
  conversations: ChatConversation[];
  folders: ChatConversationFolder[];
  latestConversationId: string | null;
  latestConversationAgentId: string | null;
  hasMore: boolean;
  nextCursor: string | null;
};

export type ConversationListPayload = ChatConversation[] | ConversationListPage;

export function latestConversationIdFromList(
  conversations: ChatConversation[],
) {
  return (
    conversations.reduce<ChatConversation | null>((latest, current) => {
      if (!latest) return current;
      if (current.updatedAt > latest.updatedAt) return current;
      if (current.updatedAt === latest.updatedAt && current.id > latest.id) {
        return current;
      }
      return latest;
    }, null)?.id ?? null
  );
}

export function normalizeConversationList(
  payload: ConversationListPayload,
): ConversationListPage {
  if (Array.isArray(payload)) {
    const latestConversationId = latestConversationIdFromList(payload);
    return {
      conversations: payload,
      folders: [],
      latestConversationId,
      latestConversationAgentId:
        payload.find((conversation) => conversation.id === latestConversationId)
          ?.agentId ?? null,
      hasMore: false,
      nextCursor: null,
    };
  }
  const conversations = payload.conversations ?? [];
  const latestConversationId =
    payload.latestConversationId ?? latestConversationIdFromList(conversations);
  return {
    conversations,
    folders: payload.folders ?? [],
    latestConversationId,
    latestConversationAgentId:
      payload.latestConversationAgentId ??
      conversations.find(
        (conversation) => conversation.id === latestConversationId,
      )?.agentId ??
      null,
    hasMore: payload.hasMore,
    nextCursor: payload.nextCursor,
  };
}
