import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { encryptValue } from "@/lib/crypto";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";

export const CHAT_STREAM_LEASE_MS = 30_000;
export const CHAT_STREAM_HEARTBEAT_MS = 5_000;
export const CHAT_STREAM_PREPARATION_LEASE_MS = 5 * 60_000;

export class ChatStreamHardTimeoutError extends Error {
  constructor() {
    super("Chat stream exceeded its maximum runtime");
    this.name = "ChatStreamHardTimeoutError";
  }
}

export function isChatStreamHardTimeoutAbort(signal: AbortSignal) {
  return signal.reason instanceof ChatStreamHardTimeoutError;
}

export function chatStreamIdempotencyKey(
  messageId: string,
  generationId: string,
) {
  return `chat:${messageId}:${generationId}`;
}

export function chatStreamLeaseValues(now = new Date()) {
  return {
    streamGenerationId: randomUUID(),
    streamStartedAt: now,
    streamHeartbeatAt: now,
    streamLeaseExpiresAt: new Date(
      now.getTime() + CHAT_STREAM_PREPARATION_LEASE_MS,
    ),
  };
}

export async function heartbeatChatStream(
  messageId: string,
  generationId: string,
  now = new Date(),
) {
  const [active] = await db
    .update(messages)
    .set({
      streamHeartbeatAt: now,
      streamLeaseExpiresAt: new Date(now.getTime() + CHAT_STREAM_LEASE_MS),
    })
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.status, "streaming"),
        eq(messages.streamGenerationId, generationId),
      ),
    )
    .returning({ id: messages.id });
  return Boolean(active);
}

export function startChatStreamLeaseHeartbeat(
  messageId: string,
  generationId: string,
  abortController: AbortController,
  options?: {
    hardTimeoutMs?: number;
    onHardTimeout?: () => Promise<void> | void;
  },
) {
  let stopped = false;
  let heartbeat: Promise<void> | null = null;

  const tick = () => {
    if (stopped || heartbeat) return;
    heartbeat = heartbeatChatStream(messageId, generationId)
      .then((active) => {
        if (!active && !abortController.signal.aborted) {
          abortController.abort(
            new Error("Chat stream was cancelled or lost its lease"),
          );
        }
      })
      .catch(() => {
        // A transient database failure must not leak an unhandled rejection.
        // The existing lease still bounds how long a lost producer can linger.
      })
      .finally(() => {
        heartbeat = null;
      });
  };

  const interval = setInterval(tick, CHAT_STREAM_HEARTBEAT_MS);
  interval.unref?.();
  tick();

  const hardTimeout =
    options?.hardTimeoutMs && options.hardTimeoutMs > 0
      ? setTimeout(() => {
          if (stopped) return;
          stopped = true;
          clearInterval(interval);
          abortController.abort(new ChatStreamHardTimeoutError());
          void Promise.resolve(options.onHardTimeout?.()).catch(() => {
            // The current lease is no longer renewed. If the immediate
            // terminal transition cannot reach the database, the reaper will
            // converge it once the existing lease expires.
          });
        }, options.hardTimeoutMs)
      : null;
  hardTimeout?.unref?.();

  return async () => {
    stopped = true;
    clearInterval(interval);
    if (hardTimeout) clearTimeout(hardTimeout);
    await heartbeat;
  };
}

export async function failChatStreamDueToTimeout(input: {
  messageId: string;
  generationId: string;
  errorMessage: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [failed] = await tx
      .update(messages)
      .set({
        status: "failed",
        completedAt: now,
        streamLeaseExpiresAt: null,
      })
      .where(
        and(
          eq(messages.id, input.messageId),
          eq(messages.status, "streaming"),
          eq(messages.streamGenerationId, input.generationId),
        ),
      )
      .returning({ conversationId: messages.conversationId });
    if (!failed) return false;

    const [lastPart] = await tx
      .select({
        sortOrder: sql<number>`coalesce(max(${messageParts.sortOrder}), -1)`,
      })
      .from(messageParts)
      .where(eq(messageParts.messageId, input.messageId));
    await tx.insert(messageParts).values({
      messageId: input.messageId,
      type: "error",
      contentEncrypted: await encryptValue(input.errorMessage),
      metadataJson: null,
      sortOrder: Number(lastPart?.sortOrder ?? -1) + 1,
    });
    await tx
      .update(conversations)
      .set({ updatedAt: now })
      .where(eq(conversations.id, failed.conversationId));
    return true;
  });
}

export async function reapExpiredChatStreams(
  now = new Date(),
  messageIds?: string[],
) {
  if (messageIds && messageIds.length === 0) return [];
  const legacyLeaseCutoff = new Date(
    now.getTime() - CHAT_STREAM_PREPARATION_LEASE_MS,
  );

  return db.transaction(async (tx) => {
    const expired = await tx
      .update(messages)
      .set({
        status: "failed",
        completedAt: now,
        streamLeaseExpiresAt: null,
      })
      .where(
        and(
          inArray(messages.status, ["pending", "streaming"]),
          eq(messages.role, "assistant"),
          or(
            lt(messages.streamLeaseExpiresAt, now),
            and(
              isNull(messages.streamLeaseExpiresAt),
              lt(messages.createdAt, legacyLeaseCutoff),
            ),
          ),
          messageIds ? inArray(messages.id, messageIds) : undefined,
        ),
      )
      .returning({
        id: messages.id,
        conversationId: messages.conversationId,
      });

    const conversationIds = [
      ...new Set(expired.map(({ conversationId }) => conversationId)),
    ];
    if (expired.length > 0) {
      const expiredMessageIds = expired.map(({ id }) => id);
      const highestSortOrders = await tx
        .select({
          messageId: messageParts.messageId,
          sortOrder: sql<number>`coalesce(max(${messageParts.sortOrder}), -1)`,
        })
        .from(messageParts)
        .where(inArray(messageParts.messageId, expiredMessageIds))
        .groupBy(messageParts.messageId);
      const sortOrderByMessageId = new Map(
        highestSortOrders.map(({ messageId, sortOrder }) => [
          messageId,
          Number(sortOrder),
        ]),
      );
      const errorMessage = await encryptValue(
        "Generation was interrupted before it could finish. Please try again.",
      );
      await tx.insert(messageParts).values(
        expired.map(({ id }) => ({
          messageId: id,
          type: "error" as const,
          contentEncrypted: errorMessage,
          metadataJson: null,
          sortOrder: (sortOrderByMessageId.get(id) ?? -1) + 1,
        })),
      );
    }
    if (conversationIds.length > 0) {
      await tx
        .update(conversations)
        .set({ updatedAt: now })
        .where(inArray(conversations.id, conversationIds));
    }
    return expired;
  });
}
