import { db } from "@/server/infrastructure/db";
import {
  conversationFolders,
  conversations,
} from "@/server/infrastructure/db/schema";
import { and, asc, desc, eq, isNull, type SQLWrapper } from "drizzle-orm";
import { NextResponse } from "next/server";

import type { ConversationListRow } from "./route.get.part-a";
import { createConversationCursor } from "./route.query-schema";

export async function buildConversationMetaResponse(input: {
  includeMeta: string | undefined;
  scopeConditions: (SQLWrapper | undefined)[];
  workspaceId: string;
  userId: string;
  liveList: ConversationListRow[];
  hasMore: boolean;
  list: ConversationListRow[];
}): Promise<Response | null> {
  const {
    includeMeta,
    scopeConditions,
    workspaceId,
    userId,
    liveList,
    hasMore,
    list,
  } = input;
  if (includeMeta !== "true") return null;
  const [folders, latestConversation] = await Promise.all([
    db
      .select({
        id: conversationFolders.id,
        name: conversationFolders.name,
        sortOrder: conversationFolders.sortOrder,
        createdAt: conversationFolders.createdAt,
        updatedAt: conversationFolders.updatedAt,
      })
      .from(conversationFolders)
      .where(
        and(
          eq(conversationFolders.workspaceId, workspaceId),
          eq(conversationFolders.userId, userId),
          isNull(conversationFolders.archivedAt),
        ),
      )
      .orderBy(
        asc(conversationFolders.sortOrder),
        asc(conversationFolders.createdAt),
        asc(conversationFolders.id),
      ),
    db
      .select({
        id: conversations.id,
        agentId: conversations.agentId,
      })
      .from(conversations)
      .where(and(...scopeConditions))
      .orderBy(desc(conversations.updatedAt), desc(conversations.id))
      .limit(1),
  ]);
  return NextResponse.json({
    conversations: liveList,
    folders,
    latestConversationId: latestConversation[0]?.id ?? null,
    latestConversationAgentId: latestConversation[0]?.agentId ?? null,
    hasMore,
    nextCursor: hasMore ? createConversationCursor(list.at(-1)) : null,
  });
}
