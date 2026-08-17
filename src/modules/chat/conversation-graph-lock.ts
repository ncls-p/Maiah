import { eq } from "drizzle-orm";

import { db, withPostgresAdvisoryLock } from "@/server/infrastructure/db";
import { conversations } from "@/server/infrastructure/db/schema";

const MAX_CONVERSATION_GRAPH_DEPTH = 64;

export async function resolveConversationGraphRootId(conversationId: string) {
  let currentId = conversationId;
  const path: string[] = [];
  const pathIndex = new Map<string, number>();

  for (let depth = 0; depth < MAX_CONVERSATION_GRAPH_DEPTH; depth += 1) {
    const cycleStart = pathIndex.get(currentId);
    if (cycleStart !== undefined) {
      return path.slice(cycleStart).sort()[0] ?? conversationId;
    }
    pathIndex.set(currentId, path.length);
    path.push(currentId);
    const [conversation] = await db
      .select({ parentConversationId: conversations.parentConversationId })
      .from(conversations)
      .where(eq(conversations.id, currentId))
      .limit(1);
    if (!conversation?.parentConversationId) return currentId;
    currentId = conversation.parentConversationId;
  }

  throw new Error("Conversation graph exceeds the supported depth");
}

export async function withConversationGraphLock<T>(
  conversationId: string,
  callback: () => Promise<T>,
): Promise<T> {
  type LockAttempt =
    | { kind: "retry"; rootId: string }
    | { kind: "value"; value: T };
  let expectedRootId = await resolveConversationGraphRootId(conversationId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await withPostgresAdvisoryLock<LockAttempt>(
      `conversation-graph:${expectedRootId}`,
      async () => {
        const currentRootId =
          await resolveConversationGraphRootId(conversationId);
        if (currentRootId !== expectedRootId) {
          return { kind: "retry", rootId: currentRootId };
        }
        return { kind: "value", value: await callback() };
      },
    );
    if (result.kind === "value") return result.value;
    expectedRootId = result.rootId;
  }

  throw new Error("Conversation graph changed while acquiring its lock");
}
