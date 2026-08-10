import { decryptValue } from "@/lib/crypto";
import { logHandledError } from "@/lib/logger";
import { projectToolMessagePayload } from "@/modules/tool/safe-payload";
import { db } from "@/server/infrastructure/db";
import {
  messageParts,
  messages,
  usageEvents,
} from "@/server/infrastructure/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function getConversationMessages(conversationId: string) {
  const messageRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  if (messageRows.length === 0) return [];

  const partsByMessageId = new Map<
    string,
    Array<typeof messageParts.$inferSelect>
  >();
  const parts = await db
    .select()
    .from(messageParts)
    .where(
      inArray(
        messageParts.messageId,
        messageRows.map((message) => message.id),
      ),
    )
    .orderBy(messageParts.messageId, messageParts.sortOrder);

  for (const part of parts) {
    const existing = partsByMessageId.get(part.messageId);
    if (existing) {
      existing.push(part);
    } else {
      partsByMessageId.set(part.messageId, [part]);
    }
  }

  async function renderMessagePart(
    part: typeof messageParts.$inferSelect,
  ): Promise<{ type: string; content: string }> {
    if (
      (part.type === "text" ||
        part.type === "reasoning" ||
        part.type === "suggestions" ||
        part.type === "citations" ||
        part.type === "error") &&
      part.contentEncrypted
    ) {
      try {
        const content = await decryptValue(part.contentEncrypted);
        return { type: part.type, content };
      } catch {
        return {
          type: part.type,
          content: "[decryption failed]",
        };
      }
    }
    if (part.type === "tool-call" || part.type === "tool-result") {
      return {
        type: part.type,
        content: JSON.stringify(projectToolMessagePayload(part.metadataJson)),
      };
    }

    return {
      type: part.type,
      content: part.metadataJson
        ? JSON.stringify(part.metadataJson)
        : (part.contentEncrypted ?? ""),
    };
  }

  return Promise.all(
    messageRows.map(async (msg) => ({
      id: msg.id,
      role: msg.role,
      status: msg.status,
      parts: await Promise.all(
        (partsByMessageId.get(msg.id) ?? []).map(renderMessagePart),
      ),
      createdAt: msg.createdAt.toISOString(),
    })),
  );
}

// ─── Usage Tracking ────────────────────────────────────────────────────

export async function recordUsageEvent(input: {
  workspaceId: string;
  userId: string;
  providerId?: string;
  modelId?: string;
  agentId?: string;
  conversationId?: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: string;
  latencyMs?: number;
  status?: string;
  metadataJson?: Record<string, unknown>;
}) {
  try {
    await db.insert(usageEvents).values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      providerId: input.providerId || null,
      modelId: input.modelId || null,
      agentId: input.agentId || null,
      conversationId: input.conversationId || null,
      operation: input.operation,
      inputTokens: input.inputTokens || null,
      outputTokens: input.outputTokens || null,
      costUsd: input.costUsd || null,
      latencyMs: input.latencyMs || null,
      status: input.status || null,
      metadataJson: input.metadataJson ?? null,
    });
  } catch (error) {
    logHandledError("Failed to record usage event", {}, error as Error);
  }
}
