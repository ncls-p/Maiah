import { and, asc, desc, eq, notInArray, or } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";
import type { ModelMessage } from "ai";
import { mergeHistoryWithAttachmentMessages } from "./route-history.merge-history-with-attachment-messages";
import { buildConversationModelMessages } from "./route-history.load-conversation-history.part-a";

export async function loadConversationHistory(
  conversationId: string,
  context: { workspaceId: string; userId: string },
  summaryOrLegacyLimit?:
    | boolean
    | number
    | {
        summaryEnabled?: boolean;
        maxMessages?: number;
        activeAssistantMessageId?: string;
      },
): Promise<ModelMessage[]> {
  const historyLimit =
    typeof summaryOrLegacyLimit === "number" && summaryOrLegacyLimit > 0
      ? Math.floor(summaryOrLegacyLimit)
      : typeof summaryOrLegacyLimit === "object" &&
          Number.isFinite(summaryOrLegacyLimit.maxMessages)
        ? Math.max(2, Math.floor(summaryOrLegacyLimit.maxMessages ?? 2))
        : null;
  const summaryEnabled =
    summaryOrLegacyLimit === true ||
    (typeof summaryOrLegacyLimit === "object" &&
      summaryOrLegacyLimit.summaryEnabled === true);
  const activeAssistantMessageId =
    typeof summaryOrLegacyLimit === "object"
      ? summaryOrLegacyLimit.activeAssistantMessageId
      : undefined;
  const modelHistoryCondition = and(
    eq(messages.conversationId, conversationId),
    or(
      notInArray(messages.status, ["pending", "streaming"]),
      activeAssistantMessageId
        ? eq(messages.id, activeAssistantMessageId)
        : undefined,
    ),
  );
  const [summaryRow] = summaryEnabled
    ? await db
        .select({
          encrypted: conversations.summaryEncrypted,
          throughMessageId: conversations.summaryThroughMessageId,
        })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)
    : [];
  let recentMessageRows = historyLimit
    ? (
        await db
          .select({
            id: messages.id,
            role: messages.role,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(modelHistoryCondition)
          .orderBy(desc(messages.createdAt), desc(messages.id))
          .limit(historyLimit)
      ).reverse()
    : await db
        .select({
          id: messages.id,
          role: messages.role,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(modelHistoryCondition)
        .orderBy(asc(messages.createdAt), asc(messages.id));
  if (summaryRow?.throughMessageId) {
    const boundary = recentMessageRows.findIndex(
      (message) => message.id === summaryRow.throughMessageId,
    );
    if (boundary >= 0)
      recentMessageRows = recentMessageRows.slice(boundary + 1);
  }
  const attachmentMessageRows = historyLimit
    ? await db
        .select({
          id: messages.id,
          role: messages.role,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(messageParts, eq(messageParts.messageId, messages.id))
        .where(
          and(
            modelHistoryCondition,
            eq(messages.role, "user"),
            eq(messageParts.type, "file"),
          ),
        )
        .orderBy(asc(messages.createdAt), asc(messages.id))
    : [];
  const messageRows = mergeHistoryWithAttachmentMessages(
    recentMessageRows,
    attachmentMessageRows,
  );

  const modelMessageRows = messageRows.filter(
    (message) => message.role === "user" || message.role === "assistant",
  );
  return buildConversationModelMessages({
    conversationId,
    summaryRow,
    modelMessageRows,
    context,
  });
}
