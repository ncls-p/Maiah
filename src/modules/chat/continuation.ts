import { and, desc, eq, inArray, notInArray } from "drizzle-orm";

import { decryptValue } from "@/lib/crypto";
import { isUniqueConstraintError } from "@/lib/database-errors";
import { chatStreamLeaseValues } from "@/modules/chat/chat-stream-lease";
import { db } from "@/server/infrastructure/db";
import { messageParts, messages } from "@/server/infrastructure/db/schema";

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
  let claimed:
    | {
        message: typeof messages.$inferSelect;
        parts: Array<{
          id: string;
          type: typeof messageParts.$inferSelect.type;
          contentEncrypted: string | null;
          sortOrder: number;
        }>;
      }
    | { status: "not_found" | "not_latest" | "already_streaming" };
  try {
    claimed = await db.transaction(async (tx) => {
      const [latestMessage] = await tx
        .select()
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(1)
        .for("update");

      if (
        !latestMessage ||
        latestMessage.id !== input.messageId ||
        latestMessage.role !== "assistant"
      ) {
        const [requestedMessage] = await tx
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
        return {
          status: requestedMessage ? "not_latest" : "not_found",
        } as const;
      }
      if (
        latestMessage.status === "pending" ||
        latestMessage.status === "streaming"
      ) {
        return { status: "already_streaming" } as const;
      }

      const [claimedMessage] = await tx
        .update(messages)
        .set({
          status: "streaming",
          providerId: input.providerId,
          modelId: input.modelId,
          completedAt: null,
          ...chatStreamLeaseValues(),
        })
        .where(
          and(
            eq(messages.id, input.messageId),
            notInArray(messages.status, ["pending", "streaming"]),
          ),
        )
        .returning();
      if (!claimedMessage) return { status: "already_streaming" } as const;

      await tx
        .delete(messageParts)
        .where(
          and(
            eq(messageParts.messageId, claimedMessage.id),
            inArray(messageParts.type, ["suggestions", "impact"]),
          ),
        );

      const parts = await tx
        .select({
          id: messageParts.id,
          type: messageParts.type,
          contentEncrypted: messageParts.contentEncrypted,
          sortOrder: messageParts.sortOrder,
        })
        .from(messageParts)
        .where(eq(messageParts.messageId, claimedMessage.id))
        .orderBy(messageParts.sortOrder, messageParts.createdAt);
      return { message: claimedMessage, parts };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "already_streaming" };
    }
    throw error;
  }
  if ("status" in claimed) return claimed;

  const claimedMessage = claimed.message;
  const existingParts = claimed.parts;
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
