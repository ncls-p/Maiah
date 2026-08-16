import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messages,
  toolInvocations,
} from "@/server/infrastructure/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function archiveBranchesAnchoredToMessages(
  tx: Transaction,
  conversationId: string,
  messageIds: string[],
) {
  if (messageIds.length === 0) return;
  const directBranches = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.parentConversationId, conversationId),
        inArray(conversations.branchFromMessageId, messageIds),
        eq(conversations.status, "active"),
        isNull(conversations.archivedAt),
      ),
    );
  let frontier = directBranches.map(({ id }) => id);
  const branchIds = new Set(frontier);
  while (frontier.length > 0) {
    const descendants = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          inArray(conversations.parentConversationId, frontier),
          eq(conversations.status, "active"),
          isNull(conversations.archivedAt),
        ),
      );
    frontier = descendants
      .map(({ id }) => id)
      .filter((id) => !branchIds.has(id));
    for (const id of frontier) branchIds.add(id);
  }
  if (branchIds.size === 0) return;
  await tx
    .update(conversations)
    .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
    .where(inArray(conversations.id, [...branchIds]));
}

export async function truncateConversationMessages(input: {
  tx: Transaction;
  conversationId: string;
  anchorMessageId: string;
  includeAnchor: boolean;
}) {
  const orderedMessages = await input.tx
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, input.conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  const anchorIndex = orderedMessages.findIndex(
    ({ id }) => id === input.anchorMessageId,
  );
  if (anchorIndex < 0) throw new Error("Message not found");
  const firstRemovedIndex = anchorIndex + (input.includeAnchor ? 0 : 1);
  const removedMessageIds = orderedMessages
    .slice(firstRemovedIndex)
    .map(({ id }) => id);

  await archiveBranchesAnchoredToMessages(
    input.tx,
    input.conversationId,
    removedMessageIds,
  );
  if (removedMessageIds.length > 0) {
    await input.tx
      .delete(toolInvocations)
      .where(inArray(toolInvocations.messageId, removedMessageIds));
    await input.tx
      .delete(messages)
      .where(inArray(messages.id, removedMessageIds));
  }
  await input.tx
    .update(conversations)
    .set({
      summaryEncrypted: null,
      summaryThroughMessageId: null,
      summaryTokenCount: null,
      summaryUpdatedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, input.conversationId));

  return removedMessageIds;
}
