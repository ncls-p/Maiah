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

export const EXPLICIT_FORK_BRANCH_KIND = "fork";
export const RESPONSE_VERSION_BRANCH_KIND = "response_version";

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

async function copyConversationPrefix(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sourceMessages: Awaited<ReturnType<typeof orderedConversationMessages>>,
  targetConversationId: string,
  lastMessageIndex: number,
) {
  const copiedMessageIds = new Map<string, string>();
  for (const sourceMessage of sourceMessages.slice(0, lastMessageIndex + 1)) {
    const [copiedMessage] = await tx
      .insert(messages)
      .values({
        conversationId: targetConversationId,
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
    copiedMessageIds.set(sourceMessage.id, copiedMessage.id);
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
  return copiedMessageIds;
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
        branchKind: EXPLICIT_FORK_BRANCH_KIND,
        isEphemeral: input.source.isEphemeral,
        ephemeralTtlMinutes: input.source.ephemeralTtlMinutes,
        expiresAt: input.source.expiresAt,
      })
      .returning();

    await copyConversationPrefix(tx, sourceMessages, fork.id, branchIndex);
    return fork;
  });
}

export async function forkConversationForRegeneration(input: {
  source: typeof conversations.$inferSelect;
  assistantMessageId: string;
  userId: string;
}) {
  let baseConversation = input.source;
  let baseMessages = await orderedConversationMessages(input.source.id);
  let assistantIndex = baseMessages.findIndex(
    (message) => message.id === input.assistantMessageId,
  );
  const requestedAssistant = baseMessages[assistantIndex];
  if (
    assistantIndex < 0 ||
    requestedAssistant.role !== "assistant" ||
    requestedAssistant.status === "pending" ||
    requestedAssistant.status === "streaming"
  ) {
    throw new Error("Assistant message is not ready for regeneration");
  }

  if (input.source.parentConversationId && input.source.branchFromMessageId) {
    const [parentConversation] = await db
      .select()
      .from(conversations)
      .where(activeConversation(input.source.parentConversationId))
      .limit(1);
    if (parentConversation?.userId === input.userId) {
      const parentMessages = await orderedConversationMessages(
        parentConversation.id,
      );
      const parentAnchorIndex = parentMessages.findIndex(
        (message) => message.id === input.source.branchFromMessageId,
      );
      if (parentAnchorIndex === assistantIndex) {
        baseConversation = parentConversation;
        baseMessages = parentMessages;
        assistantIndex = parentAnchorIndex;
      }
    }
  }

  const branchMessage = baseMessages[assistantIndex];
  const userMessageIndex = baseMessages.findLastIndex(
    (message, index) => index < assistantIndex && message.role === "user",
  );
  const userMessage = baseMessages[userMessageIndex];
  if (!branchMessage || !userMessage) {
    throw new Error("User prompt for regeneration not found");
  }

  return db.transaction(async (tx) => {
    const [fork] = await tx
      .insert(conversations)
      .values({
        workspaceId: baseConversation.workspaceId,
        agentId: baseConversation.agentId,
        agentVersionId: baseConversation.agentVersionId,
        userId: input.userId,
        title: baseConversation.title,
        status: "active",
        parentConversationId: baseConversation.id,
        branchFromMessageId: branchMessage.id,
        branchKind: RESPONSE_VERSION_BRANCH_KIND,
        isEphemeral: baseConversation.isEphemeral,
        ephemeralTtlMinutes: baseConversation.ephemeralTtlMinutes,
        expiresAt: baseConversation.expiresAt,
      })
      .returning();
    const copiedMessageIds = await copyConversationPrefix(
      tx,
      baseMessages,
      fork.id,
      userMessageIndex,
    );
    const copiedUserMessageId = copiedMessageIds.get(userMessage.id);
    if (!copiedUserMessageId) throw new Error("Failed to copy user prompt");
    return { fork, copiedUserMessageId };
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
