import { and,desc,eq,inArray,ne } from "drizzle-orm";

import { decryptValue } from "@/lib/crypto";
import { db } from "@/server/infrastructure/db";
import { messageParts,messages } from "@/server/infrastructure/db/schema";

export type AssistantContinuationClaim =
  | {
      status: "claimed";
      message: typeof messages.$inferSelect;
      nextSortOrder: number;
      appendableTextPart: { id: string; content: string } | null;
    }
  | {
      status: "not_found" | "not_latest" | "already_streaming";
    };

export async function claimAssistantContinuation(input: {
  conversationId: string;
  messageId: string;
  providerId: string | null;
  modelId: string;
}): Promise<AssistantContinuationClaim> {
  const [latestMessage] = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, input.conversationId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);

  if (
    !latestMessage ||
    latestMessage.id !== input.messageId ||
    latestMessage.role !== "assistant"
  ) {
    const [requestedMessage] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.id, input.messageId),
          eq(messages.conversationId, input.conversationId),
          eq(messages.role, "assistant"),
        ),
      )
      .limit(1);
    return { status: requestedMessage ? "not_latest" : "not_found" };
  }
  if (latestMessage.status === "streaming") {
    return { status: "already_streaming" };
  }

  const [claimedMessage] = await db
    .update(messages)
    .set({
      status: "streaming",
      providerId: input.providerId,
      modelId: input.modelId,
      completedAt: null,
    })
    .where(
      and(eq(messages.id, input.messageId), ne(messages.status, "streaming")),
    )
    .returning();
  if (!claimedMessage) return { status: "already_streaming" };

  await db
    .delete(messageParts)
    .where(
      and(
        eq(messageParts.messageId, claimedMessage.id),
        inArray(messageParts.type, ["suggestions", "impact"]),
      ),
    );

  const existingParts = await db
    .select({
      id: messageParts.id,
      type: messageParts.type,
      contentEncrypted: messageParts.contentEncrypted,
      sortOrder: messageParts.sortOrder,
    })
    .from(messageParts)
    .where(eq(messageParts.messageId, claimedMessage.id))
    .orderBy(messageParts.sortOrder, messageParts.createdAt);
  const lastPart = existingParts.at(-1);
  let appendableTextPart: { id: string; content: string } | null = null;
  if (lastPart?.type === "text" && lastPart.contentEncrypted) {
    try {
      appendableTextPart = {
        id: lastPart.id,
        content: await decryptValue(lastPart.contentEncrypted),
      };
    } catch {
      appendableTextPart = null;
    }
  }

  return {
    status: "claimed",
    message: claimedMessage,
    nextSortOrder:
      existingParts.reduce(
        (highest, part) => Math.max(highest, part.sortOrder),
        -1,
      ) + 1,
    appendableTextPart,
  };
}
