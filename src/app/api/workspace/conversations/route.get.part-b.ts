import {
  attachConversationLiveState,
  canonicalizeConversationActivities,
} from "@/modules/chat/conversation-list-live-state";
import { reapExpiredChatStreams } from "@/modules/chat/chat-stream-lease";
import { listActiveResponseVersionDescendants } from "@/modules/chat/response-version-lineage";
import { db } from "@/server/infrastructure/db";
import {
  conversationReadStates,
  messages,
} from "@/server/infrastructure/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

import type { ConversationListRow } from "./route.get.part-a";

export async function attachConversationActivities(input: {
  list: ConversationListRow[];
  userId: string;
}): Promise<ConversationListRow[]> {
  const { list, userId } = input;
  const conversationIds = list.map(({ id }) => id);
  const responseVersions =
    await listActiveResponseVersionDescendants(conversationIds);
  const canonicalConversationIds = new Map(
    responseVersions.map(
      ({ id, rootConversationId }) => [id, rootConversationId] as const,
    ),
  );
  const activityConversationIds = [
    ...conversationIds,
    ...responseVersions.map(({ id }) => id),
  ];
  const [rawAssistantActivities, readStates] =
    activityConversationIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .selectDistinctOn([messages.conversationId], {
              conversationId: messages.conversationId,
              messageId: messages.id,
              status: messages.status,
              createdAt: messages.createdAt,
              completedAt: messages.completedAt,
            })
            .from(messages)
            .where(
              and(
                inArray(messages.conversationId, activityConversationIds),
                eq(messages.role, "assistant"),
              ),
            )
            .orderBy(
              messages.conversationId,
              desc(messages.createdAt),
              desc(messages.id),
            ),
          db
            .select({
              conversationId: conversationReadStates.conversationId,
              lastReadAt: conversationReadStates.lastReadAt,
            })
            .from(conversationReadStates)
            .where(
              and(
                eq(conversationReadStates.userId, userId),
                inArray(conversationReadStates.conversationId, conversationIds),
              ),
            ),
        ]);
  const latestAssistantActivities = canonicalizeConversationActivities(
    rawAssistantActivities,
    canonicalConversationIds,
  );
  const activeActivityIds = latestAssistantActivities
    .filter(({ status }) => status === "pending" || status === "streaming")
    .map(({ messageId }) => messageId);
  const reconciledAt = new Date();
  const expiredActivities = await reapExpiredChatStreams(
    reconciledAt,
    activeActivityIds,
  );
  if (expiredActivities.length > 0) {
    const expiredIds = new Set(expiredActivities.map(({ id }) => id));
    for (const activity of latestAssistantActivities) {
      if (!expiredIds.has(activity.messageId)) continue;
      activity.status = "failed";
      activity.completedAt = reconciledAt;
    }
  }
  const liveList = attachConversationLiveState(
    list,
    latestAssistantActivities,
    readStates,
  );
  return liveList;
}
