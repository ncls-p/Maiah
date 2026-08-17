import { db } from "@/server/infrastructure/db";
import { conversationReadStates } from "@/server/infrastructure/db/schema";
import { sql } from "drizzle-orm";

export async function markConversationRead(
  conversationId: string,
  userId: string,
  readAt = new Date(),
) {
  await db
    .insert(conversationReadStates)
    .values({ conversationId, userId, lastReadAt: readAt, updatedAt: readAt })
    .onConflictDoUpdate({
      target: [
        conversationReadStates.conversationId,
        conversationReadStates.userId,
      ],
      set: {
        lastReadAt: sql`greatest(${conversationReadStates.lastReadAt}, ${readAt})`,
        updatedAt: sql`greatest(${conversationReadStates.updatedAt}, ${readAt})`,
      },
    });
}
