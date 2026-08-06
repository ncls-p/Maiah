import { decryptValue } from "@/lib/crypto";
import { db } from "@/server/infrastructure/db";
import { messageParts,messages } from "@/server/infrastructure/db/schema";
import { and,desc,eq } from "drizzle-orm";

export async function findUserMessageForResend(input: { conversationId: string; messageId: string; content: string }) {
  const [exactMatch] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, input.messageId), eq(messages.conversationId, input.conversationId), eq(messages.role, "user")))
    .limit(1);

  if (exactMatch) return exactMatch;

  // Backward compatibility for messages created before the client synced
  // server-side user message IDs. Those client-side UUIDs are valid UUIDs
  // but do not exist in the database, so find the intended user message by
  // exact text content within this conversation.
  const userMessages = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, input.conversationId), eq(messages.role, "user")))
    .orderBy(desc(messages.createdAt));

  for (const message of userMessages) {
    const parts = await db
      .select({
        type: messageParts.type,
        contentEncrypted: messageParts.contentEncrypted,
      })
      .from(messageParts)
      .where(eq(messageParts.messageId, message.id));
    const textParts: string[] = [];
    for (const part of parts) {
      if (part.type !== "text" || !part.contentEncrypted) continue;
      try {
        textParts.push(await decryptValue(part.contentEncrypted));
      } catch {
        // skip undecryptable legacy parts
      }
    }
    if (textParts.join("\n").trim() === input.content.trim()) {
      return message;
    }
  }

  return null;
}

export async function isFirstUserMessageInConversation(conversationId: string, userMessageId: string) {
  const [firstUserMessage] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")))
    .orderBy(messages.createdAt)
    .limit(1);

  return firstUserMessage?.id === userMessageId;
}
