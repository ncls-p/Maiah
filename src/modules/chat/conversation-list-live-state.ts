const NON_TERMINAL_MESSAGE_STATUSES = new Set(["pending", "streaming"]);
const UNREAD_MESSAGE_STATUSES = new Set(["completed", "failed", "cancelled"]);

export type ConversationAssistantActivity = {
  conversationId: string;
  sourceConversationId?: string;
  messageId: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
};

export type ConversationReadState = {
  conversationId: string;
  lastReadAt: Date;
};

export function canonicalizeConversationActivities(
  activities: ConversationAssistantActivity[],
  canonicalConversationIds: Map<string, string>,
) {
  const latestByCanonicalId = new Map<string, ConversationAssistantActivity>();
  for (const activity of activities) {
    const conversationId =
      canonicalConversationIds.get(activity.conversationId) ??
      activity.conversationId;
    const canonicalActivity = {
      ...activity,
      conversationId,
      sourceConversationId:
        activity.sourceConversationId ?? activity.conversationId,
    };
    const previous = latestByCanonicalId.get(conversationId);
    if (
      !previous ||
      canonicalActivity.createdAt > previous.createdAt ||
      (canonicalActivity.createdAt.getTime() === previous.createdAt.getTime() &&
        canonicalActivity.messageId > previous.messageId)
    ) {
      latestByCanonicalId.set(conversationId, canonicalActivity);
    }
  }
  return [...latestByCanonicalId.values()];
}

export function attachConversationLiveState<T extends { id: string }>(
  conversations: T[],
  activities: ConversationAssistantActivity[],
  readStates: ConversationReadState[],
) {
  const activityByConversationId = new Map(
    activities.map((activity) => [activity.conversationId, activity]),
  );
  const readAtByConversationId = new Map(
    readStates.map((state) => [
      state.conversationId,
      state.lastReadAt.getTime(),
    ]),
  );

  return conversations.map((conversation) => {
    const activity = activityByConversationId.get(conversation.id);
    if (!activity) {
      return { ...conversation, isStreaming: false, isUnread: false };
    }
    const isStreaming = NON_TERMINAL_MESSAGE_STATUSES.has(activity.status);
    const completedAt = activity.completedAt?.getTime() ?? null;
    const lastReadAt = readAtByConversationId.get(conversation.id) ?? null;
    const isUnread = Boolean(
      !isStreaming &&
      completedAt !== null &&
      UNREAD_MESSAGE_STATUSES.has(activity.status) &&
      (lastReadAt === null || completedAt > lastReadAt),
    );

    return {
      ...conversation,
      latestAssistantMessageId: activity.messageId,
      latestAssistantConversationId:
        activity.sourceConversationId ?? activity.conversationId,
      latestAssistantStatus: activity.status,
      latestAssistantCompletedAt: activity.completedAt?.toISOString() ?? null,
      isStreaming,
      isUnread,
    };
  });
}
