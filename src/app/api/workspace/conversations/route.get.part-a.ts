import { decryptValue } from "@/lib/crypto";
import {
  conversationSearchSnippet,
  conversationTextMatches,
} from "@/modules/chat/conversation-search";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";

export type ConversationSelection = {
  id: typeof conversations.id;
  title: typeof conversations.title;
  agentId: typeof conversations.agentId;
  agentVersionId: typeof conversations.agentVersionId;
  folderId: typeof conversations.folderId;
  pinnedAt: typeof conversations.pinnedAt;
  sidebarOrder: typeof conversations.sidebarOrder;
  isEphemeral: typeof conversations.isEphemeral;
  createdAt: typeof conversations.createdAt;
  updatedAt: typeof conversations.updatedAt;
  isOwner: SQL<boolean>;
};

export type ConversationListRow = {
  id: typeof conversations.$inferSelect.id;
  title: typeof conversations.$inferSelect.title;
  agentId: typeof conversations.$inferSelect.agentId;
  agentVersionId: typeof conversations.$inferSelect.agentVersionId;
  folderId: typeof conversations.$inferSelect.folderId;
  pinnedAt: typeof conversations.$inferSelect.pinnedAt;
  sidebarOrder: typeof conversations.$inferSelect.sidebarOrder;
  isEphemeral: typeof conversations.$inferSelect.isEphemeral;
  createdAt: typeof conversations.$inferSelect.createdAt;
  updatedAt: typeof conversations.$inferSelect.updatedAt;
  isOwner: boolean;
};

export async function fetchConversationList(input: {
  conversationSelection: ConversationSelection;
  conditions: (SQLWrapper | undefined)[];
  q: string | undefined;
  limit: number;
}): Promise<{ list: ConversationListRow[]; hasMore: boolean }> {
  const { conversationSelection, conditions, q, limit } = input;
  let list;
  let hasMore;
  if (q) {
    const candidateConversations = await db
      .select(conversationSelection)
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.updatedAt), desc(conversations.id));
    const encryptedParts = await db
      .select({
        conversationId: messages.conversationId,
        contentEncrypted: messageParts.contentEncrypted,
      })
      .from(messageParts)
      .innerJoin(messages, eq(messages.id, messageParts.messageId))
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          ...conditions,
          eq(messageParts.type, "text"),
          isNotNull(messageParts.contentEncrypted),
        ),
      )
      .orderBy(
        desc(conversations.updatedAt),
        desc(conversations.id),
        asc(messages.createdAt),
        asc(messageParts.sortOrder),
      );
    const partsByConversation = new Map<string, string[]>();
    for (const part of encryptedParts) {
      if (!part.contentEncrypted) continue;
      const existing = partsByConversation.get(part.conversationId);
      if (existing) existing.push(part.contentEncrypted);
      else
        partsByConversation.set(part.conversationId, [part.contentEncrypted]);
    }
    const matches = [];
    for (const conversation of candidateConversations) {
      if (conversationTextMatches(conversation.title, q)) {
        matches.push({
          ...conversation,
          searchMatch: {
            kind: "title" as const,
            snippet: conversationSearchSnippet(conversation.title, q),
          },
        });
      } else {
        for (const encryptedPart of partsByConversation.get(conversation.id) ??
          []) {
          try {
            const content = await decryptValue(encryptedPart);
            if (!conversationTextMatches(content, q)) continue;
            matches.push({
              ...conversation,
              searchMatch: {
                kind: "message" as const,
                snippet: conversationSearchSnippet(content, q),
              },
            });
            break;
          } catch {
            // Ignore legacy parts that cannot be decrypted with the active key.
          }
        }
      }
      if (matches.length > limit) break;
    }
    hasMore = matches.length > limit;
    list = hasMore ? matches.slice(0, limit) : matches;
  } else {
    const rows = await db
      .select(conversationSelection)
      .from(conversations)
      .where(and(...conditions))
      .orderBy(
        sql`${conversations.pinnedAt} IS NULL`,
        desc(sql`${conversations.sidebarOrder} IS NULL`),
        asc(conversations.sidebarOrder),
        desc(conversations.updatedAt),
        desc(conversations.id),
      )
      .limit(limit + 1);
    hasMore = rows.length > limit;
    list = hasMore ? rows.slice(0, limit) : rows;
  }
  return { list, hasMore };
}
