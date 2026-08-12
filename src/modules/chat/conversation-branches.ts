import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

export type ConversationBranchNavigation = {
  conversationIds: string[];
  activeIndex: number;
};

const activeConversation = (conversationId: string) =>
  and(
    eq(conversations.id, conversationId),
    eq(conversations.status, "active"),
    isNull(conversations.archivedAt),
  );

async function orderedConversationMessages(conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

export async function forkConversationAtMessage(input: {
  source: typeof conversations.$inferSelect;
  messageId: string;
  userId: string;
}) {
  const sourceMessages = await orderedConversationMessages(input.source.id);
  const branchIndex = sourceMessages.findIndex(
    (message) => message.id === input.messageId,
  );
  const branchMessage = sourceMessages[branchIndex];
  if (branchIndex < 0 || branchMessage.role !== "assistant") {
    throw new Error("Assistant message not found");
  }
  if (
    branchMessage.status === "pending" ||
    branchMessage.status === "streaming"
  ) {
    throw new Error("Wait for the response to finish before forking");
  }

  return db.transaction(async (tx) => {
    const [fork] = await tx
      .insert(conversations)
      .values({
        workspaceId: input.source.workspaceId,
        agentId: input.source.agentId,
        agentVersionId: input.source.agentVersionId,
        userId: input.userId,
        title: input.source.title,
        status: "active",
        parentConversationId: input.source.id,
        branchFromMessageId: branchMessage.id,
        isEphemeral: input.source.isEphemeral,
        ephemeralTtlMinutes: input.source.ephemeralTtlMinutes,
        expiresAt: input.source.expiresAt,
      })
      .returning();

    for (const sourceMessage of sourceMessages.slice(0, branchIndex + 1)) {
      const [copiedMessage] = await tx
        .insert(messages)
        .values({
          conversationId: fork.id,
          role: sourceMessage.role,
          status: sourceMessage.status,
          tokenInput: sourceMessage.tokenInput,
          tokenOutput: sourceMessage.tokenOutput,
          costUsd: sourceMessage.costUsd,
          modelId: sourceMessage.modelId,
          providerId: sourceMessage.providerId,
          createdAt: sourceMessage.createdAt,
          completedAt: sourceMessage.completedAt,
        })
        .returning();
      const parts = await tx
        .select()
        .from(messageParts)
        .where(eq(messageParts.messageId, sourceMessage.id))
        .orderBy(asc(messageParts.sortOrder));
      if (parts.length > 0) {
        await tx.insert(messageParts).values(
          parts.map((part) => ({
            messageId: copiedMessage.id,
            type: part.type,
            contentEncrypted: part.contentEncrypted,
            metadataJson: part.metadataJson,
            sortOrder: part.sortOrder,
            createdAt: part.createdAt,
          })),
        );
      }
    }
    return fork;
  });
}

async function childBranches(input: {
  parentConversationId: string;
  userId: string;
  branchFromMessageId?: string;
}) {
  const conditions = [
    eq(conversations.parentConversationId, input.parentConversationId),
    eq(conversations.userId, input.userId),
    eq(conversations.status, "active"),
    isNull(conversations.archivedAt),
  ];
  if (input.branchFromMessageId) {
    conditions.push(
      eq(conversations.branchFromMessageId, input.branchFromMessageId),
    );
  }
  return db
    .select({
      id: conversations.id,
      branchFromMessageId: conversations.branchFromMessageId,
    })
    .from(conversations)
    .where(and(...conditions))
    .orderBy(asc(conversations.createdAt), asc(conversations.id));
}

export async function getConversationBranchNavigation(input: {
  conversation: typeof conversations.$inferSelect;
  messageIds: string[];
  userId: string;
}) {
  const navigation = new Map<string, ConversationBranchNavigation>();
  const children = await childBranches({
    parentConversationId: input.conversation.id,
    userId: input.userId,
  });
  const childrenByMessage = Map.groupBy(
    children.filter((child) => child.branchFromMessageId),
    (child) => child.branchFromMessageId!,
  );
  for (const [messageId, branches] of childrenByMessage) {
    navigation.set(messageId, {
      conversationIds: [input.conversation.id, ...branches.map(({ id }) => id)],
      activeIndex: 0,
    });
  }

  const parentId = input.conversation.parentConversationId;
  const parentMessageId = input.conversation.branchFromMessageId;
  if (!parentId || !parentMessageId) return navigation;
  const [parent] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(activeConversation(parentId))
    .limit(1);
  if (!parent) return navigation;
  const [parentMessages, siblings] = await Promise.all([
    orderedConversationMessages(parentId),
    childBranches({
      parentConversationId: parentId,
      branchFromMessageId: parentMessageId,
      userId: input.userId,
    }),
  ]);
  const parentIndex = parentMessages.findIndex(
    (message) => message.id === parentMessageId,
  );
  const localMessageId = input.messageIds[parentIndex];
  if (!localMessageId || navigation.has(localMessageId)) return navigation;
  const conversationIds = [parent.id, ...siblings.map(({ id }) => id)];
  const activeIndex = conversationIds.indexOf(input.conversation.id);
  if (activeIndex >= 0) {
    navigation.set(localMessageId, { conversationIds, activeIndex });
  }
  return navigation;
}
