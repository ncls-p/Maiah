import { encryptValue } from "@/lib/crypto";
import { projectToolMessagePayload } from "@/modules/tool/safe-payload";
import { db } from "@/server/infrastructure/db";
import { messageParts, messages } from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";

import type { ClaimedContinuation } from "./route.execution-context";

type StreamedAssistantPart =
  | { id: string; type: "text" | "reasoning" | "suggestions"; content: string }
  | {
      id: string;
      type: "tool-call" | "tool-result" | "file" | "citations";
      metadata: unknown;
    };

export function createStreamedPartWriter(
  assistantMessageId: string,
  streamGenerationId: string,
  continuationClaim: ClaimedContinuation | null,
) {
  const parts: StreamedAssistantPart[] = [];
  let nextSortOrder = continuationClaim?.nextSortOrder ?? 0;
  let appendableTextPart = continuationClaim?.appendableTextPart ?? null;

  async function withOwnedGeneration<T>(
    status: "streaming" | "completed",
    write: (
      tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    ) => Promise<T>,
  ) {
    return db.transaction(async (tx) => {
      const [active] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.id, assistantMessageId),
            eq(messages.status, status),
            eq(messages.streamGenerationId, streamGenerationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!active)
        throw new Error("Chat stream generation is no longer active");
      return write(tx);
    });
  }

  async function appendText(type: "text" | "reasoning", content: string) {
    if (type === "text" && parts.length === 0 && appendableTextPart) {
      appendableTextPart.content += content;
      const contentEncrypted = await encryptValue(appendableTextPart.content);
      await withOwnedGeneration("streaming", (tx) =>
        tx
          .update(messageParts)
          .set({ contentEncrypted })
          .where(eq(messageParts.id, appendableTextPart!.id)),
      );
      parts.push({
        id: appendableTextPart.id,
        type,
        content: appendableTextPart.content,
      });
      appendableTextPart = null;
      return;
    }
    if (type !== "text") appendableTextPart = null;
    const lastPart = parts.at(-1);
    if (lastPart?.type === type) {
      lastPart.content += content;
      const contentEncrypted = await encryptValue(lastPart.content);
      await withOwnedGeneration("streaming", (tx) =>
        tx
          .update(messageParts)
          .set({ contentEncrypted })
          .where(eq(messageParts.id, lastPart.id)),
      );
      return;
    }
    const contentEncrypted = await encryptValue(content);
    const [inserted] = await withOwnedGeneration("streaming", (tx) =>
      tx
        .insert(messageParts)
        .values({
          messageId: assistantMessageId,
          type,
          contentEncrypted,
          metadataJson: null,
          sortOrder: nextSortOrder,
        })
        .returning({ id: messageParts.id }),
    );
    nextSortOrder += 1;
    parts.push({ id: inserted.id, type, content });
  }

  async function appendSuggestions(suggestions: string[]) {
    appendableTextPart = null;
    const content = JSON.stringify(suggestions);
    const contentEncrypted = await encryptValue(content);
    const [inserted] = await withOwnedGeneration("completed", (tx) =>
      tx
        .insert(messageParts)
        .values({
          messageId: assistantMessageId,
          type: "suggestions",
          contentEncrypted,
          metadataJson: null,
          sortOrder: nextSortOrder,
        })
        .returning({ id: messageParts.id }),
    );
    nextSortOrder += 1;
    parts.push({ id: inserted.id, type: "suggestions", content });
  }

  async function appendCitations(citations: unknown[]) {
    appendableTextPart = null;
    const contentEncrypted = await encryptValue(JSON.stringify(citations));
    const [inserted] = await withOwnedGeneration("streaming", (tx) =>
      tx
        .insert(messageParts)
        .values({
          messageId: assistantMessageId,
          type: "citations",
          contentEncrypted,
          metadataJson: null,
          sortOrder: nextSortOrder,
        })
        .returning({ id: messageParts.id }),
    );
    nextSortOrder += 1;
    parts.push({
      id: inserted.id,
      type: "citations",
      metadata: { kind: "knowledge_citations", count: citations.length },
    });
  }

  async function appendMetadata(
    type: "tool-call" | "tool-result" | "file",
    metadata: unknown,
  ) {
    appendableTextPart = null;
    const safeMetadata =
      type === "file" ? metadata : projectToolMessagePayload(metadata);
    const contentEncrypted =
      type === "file"
        ? null
        : await encryptValue(JSON.stringify(metadata ?? null));
    const [inserted] = await withOwnedGeneration("streaming", (tx) =>
      tx
        .insert(messageParts)
        .values({
          messageId: assistantMessageId,
          type,
          contentEncrypted,
          metadataJson: safeMetadata,
          sortOrder: nextSortOrder,
        })
        .returning({ id: messageParts.id }),
    );
    nextSortOrder += 1;
    parts.push({ id: inserted.id, type, metadata: safeMetadata });
  }

  return {
    parts,
    appendText,
    appendSuggestions,
    appendCitations,
    appendMetadata,
    get nextSortOrder() {
      return nextSortOrder;
    },
  };
}

export type StreamedPartWriter = ReturnType<typeof createStreamedPartWriter>;
