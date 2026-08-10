import { logger, logHandledError } from "@/lib/logger";
import {
  deleteChatAttachment,
  isChatFileAttachment,
  isChatImageAttachment,
} from "@/modules/chat/attachments";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
  toolInvocations,
} from "@/server/infrastructure/db/schema";
import { and, asc, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";

const DEFAULT_PURGE_BATCH_SIZE = 100;

type PurgeBatch = {
  conversationIds: string[];
  attachmentIds: string[];
};

async function deleteExpiredBatch(
  now: Date,
  limit: number,
): Promise<PurgeBatch> {
  return db.transaction(async (tx) => {
    const expired = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.isEphemeral, true),
          isNotNull(conversations.expiresAt),
          lte(conversations.expiresAt, now),
        ),
      )
      .orderBy(asc(conversations.expiresAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    const conversationIds = expired.map((conversation) => conversation.id);
    if (conversationIds.length === 0)
      return { conversationIds: [], attachmentIds: [] };

    const conversationMessages = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds));
    const messageIds = conversationMessages.map((message) => message.id);
    const attachmentRows = messageIds.length
      ? await tx
          .select({ metadata: messageParts.metadataJson })
          .from(messageParts)
          .where(
            and(
              inArray(messageParts.messageId, messageIds),
              eq(messageParts.type, "file"),
            ),
          )
      : [];
    const attachmentIds = attachmentRows.flatMap(({ metadata }) =>
      isChatFileAttachment(metadata) || isChatImageAttachment(metadata)
        ? [metadata.id]
        : [],
    );

    await tx
      .delete(toolInvocations)
      .where(
        messageIds.length
          ? or(
              inArray(toolInvocations.conversationId, conversationIds),
              inArray(toolInvocations.messageId, messageIds),
            )
          : inArray(toolInvocations.conversationId, conversationIds),
      );
    await tx
      .update(conversations)
      .set({ parentConversationId: null })
      .where(inArray(conversations.parentConversationId, conversationIds));
    if (messageIds.length)
      await tx.delete(messages).where(inArray(messages.id, messageIds));
    await tx
      .delete(conversations)
      .where(inArray(conversations.id, conversationIds));

    return { conversationIds, attachmentIds: [...new Set(attachmentIds)] };
  });
}

async function deleteUnreferencedAttachments(attachmentIds: string[]) {
  let deleted = 0;
  for (const attachmentId of attachmentIds) {
    const references = await db
      .select({ id: messageParts.id })
      .from(messageParts)
      .where(
        and(
          eq(messageParts.type, "file"),
          sql`${messageParts.metadataJson}->>'id' = ${attachmentId}`,
        ),
      )
      .limit(1);
    if (references.length > 0) continue;
    try {
      await deleteChatAttachment(attachmentId);
      deleted += 1;
    } catch (error) {
      logHandledError("Failed to delete an expired chat attachment", {
        attachmentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return deleted;
}

export async function purgeExpiredEphemeralConversations(
  input: { now?: Date; batchSize?: number } = {},
) {
  const now = input.now ?? new Date();
  const batchSize = Math.max(
    1,
    Math.min(input.batchSize ?? DEFAULT_PURGE_BATCH_SIZE, 500),
  );
  const batch = await deleteExpiredBatch(now, batchSize);
  const attachmentsDeleted = await deleteUnreferencedAttachments(
    batch.attachmentIds,
  );
  if (batch.conversationIds.length > 0) {
    logger.info("Expired temporary conversations deleted", {
      conversationsDeleted: batch.conversationIds.length,
      attachmentsDeleted,
    });
  }
  return {
    conversationsDeleted: batch.conversationIds.length,
    attachmentsDeleted,
  };
}
