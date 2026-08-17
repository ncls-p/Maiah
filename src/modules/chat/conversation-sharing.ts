import { db } from "@/server/infrastructure/db";
import { isUniqueConstraintError } from "@/lib/database-errors";
import {
  conversationShares,
  conversations,
  messageParts,
  messages,
  users,
} from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

export type ConversationAccess = {
  conversation: typeof conversations.$inferSelect;
  role: "owner" | "recipient";
  canContinue: boolean;
  continuationMode: "shared" | "fork";
};

export async function getConversationAccess(
  conversationId: string,
  userId: string,
): Promise<ConversationAccess | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.status, "active"),
        isNull(conversations.archivedAt),
      ),
    )
    .limit(1);
  if (!conversation) return null;
  if (conversation.expiresAt && conversation.expiresAt <= new Date())
    return null;
  if (conversation.userId === userId) {
    return {
      conversation,
      role: "owner",
      canContinue: true,
      continuationMode: "shared",
    };
  }

  const [share] = await db
    .select({
      canContinue: conversationShares.canContinue,
      continuationMode: conversationShares.continuationMode,
    })
    .from(conversationShares)
    .where(
      and(
        eq(conversationShares.conversationId, conversationId),
        eq(conversationShares.sharedWithUserId, userId),
      ),
    )
    .limit(1);
  if (!share) return null;
  return { conversation, role: "recipient", ...share };
}

export async function listConversationShares(
  conversationId: string,
  ownerUserId: string,
) {
  return db
    .select({
      id: conversationShares.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      canContinue: conversationShares.canContinue,
      continuationMode: conversationShares.continuationMode,
      createdAt: conversationShares.createdAt,
    })
    .from(conversationShares)
    .innerJoin(users, eq(users.id, conversationShares.sharedWithUserId))
    .where(
      and(
        eq(conversationShares.conversationId, conversationId),
        eq(conversationShares.sharedByUserId, ownerUserId),
      ),
    )
    .orderBy(asc(users.name), asc(users.email));
}

export async function upsertConversationShare(input: {
  conversation: typeof conversations.$inferSelect;
  ownerUserId: string;
  targetEmail: string;
  canContinue: boolean;
  continuationMode: "shared" | "fork";
}) {
  const [target] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.email, input.targetEmail.trim().toLowerCase()),
        ne(users.id, input.ownerUserId),
      ),
    )
    .limit(1);
  if (
    !target ||
    !(await authorization.requireWorkspaceMember(
      target.id,
      input.conversation.workspaceId,
    ))
  ) {
    throw new Error("Workspace member not found");
  }

  const [share] = await db
    .insert(conversationShares)
    .values({
      conversationId: input.conversation.id,
      sharedByUserId: input.ownerUserId,
      sharedWithUserId: target.id,
      canContinue: input.canContinue,
      continuationMode: input.canContinue ? input.continuationMode : "fork",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        conversationShares.conversationId,
        conversationShares.sharedWithUserId,
      ],
      set: {
        canContinue: input.canContinue,
        continuationMode: input.canContinue ? input.continuationMode : "fork",
        updatedAt: new Date(),
      },
    })
    .returning();
  return { ...share, user: target };
}

export async function forkSharedConversation(
  source: typeof conversations.$inferSelect,
  recipientUserId: string,
) {
  const findExistingFork = () =>
    db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.parentConversationId, source.id),
          eq(conversations.userId, recipientUserId),
          eq(conversations.branchKind, "shared_continuation"),
          eq(conversations.status, "active"),
          isNull(conversations.archivedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  const existingFork = await findExistingFork();
  if (existingFork) return existingFork;

  try {
    return await db.transaction(async (tx) => {
      const [activeSourceMessage] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, source.id),
            eq(messages.role, "assistant"),
            inArray(messages.status, ["pending", "streaming"]),
          ),
        )
        .limit(1);
      if (activeSourceMessage) {
        throw new Error(
          "Wait for the shared response to finish before continuing",
        );
      }

      const [fork] = await tx
        .insert(conversations)
        .values({
          workspaceId: source.workspaceId,
          agentId: source.agentId,
          agentVersionId: source.agentVersionId,
          userId: recipientUserId,
          title: source.title,
          status: "active",
          parentConversationId: source.id,
          branchKind: "shared_continuation",
        })
        .returning();
      const sourceMessages = await tx
        .select()
        .from(messages)
        .where(eq(messages.conversationId, source.id))
        .orderBy(asc(messages.createdAt), asc(messages.id));
      for (const sourceMessage of sourceMessages) {
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
        if (parts.length) {
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
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const concurrentFork = await findExistingFork();
    if (concurrentFork) return concurrentFork;
    throw error;
  }
}
