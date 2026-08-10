import { encryptValue } from "@/lib/crypto";
import { projectToolMessagePayload } from "@/modules/tool/safe-payload";
import { db } from "@/server/infrastructure/db";
import { messageParts } from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";

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
  continuationClaim: ClaimedContinuation | null,
) {
  const parts: StreamedAssistantPart[] = [];
  let nextSortOrder = continuationClaim?.nextSortOrder ?? 0;
  let appendableTextPart = continuationClaim?.appendableTextPart ?? null;

  async function appendText(type: "text" | "reasoning", content: string) {
    if (type === "text" && parts.length === 0 && appendableTextPart) {
      appendableTextPart.content += content;
      await db
        .update(messageParts)
        .set({
          contentEncrypted: await encryptValue(appendableTextPart.content),
        })
        .where(eq(messageParts.id, appendableTextPart.id));
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
      await db
        .update(messageParts)
        .set({ contentEncrypted: await encryptValue(lastPart.content) })
        .where(eq(messageParts.id, lastPart.id));
      return;
    }
    const [inserted] = await db
      .insert(messageParts)
      .values({
        messageId: assistantMessageId,
        type,
        contentEncrypted: await encryptValue(content),
        metadataJson: null,
        sortOrder: nextSortOrder,
      })
      .returning({ id: messageParts.id });
    nextSortOrder += 1;
    parts.push({ id: inserted.id, type, content });
  }

  async function appendSuggestions(suggestions: string[]) {
    appendableTextPart = null;
    const content = JSON.stringify(suggestions);
    const [inserted] = await db
      .insert(messageParts)
      .values({
        messageId: assistantMessageId,
        type: "suggestions",
        contentEncrypted: await encryptValue(content),
        metadataJson: null,
        sortOrder: nextSortOrder,
      })
      .returning({ id: messageParts.id });
    nextSortOrder += 1;
    parts.push({ id: inserted.id, type: "suggestions", content });
  }

  async function appendCitations(citations: unknown[]) {
    appendableTextPart = null;
    const [inserted] = await db
      .insert(messageParts)
      .values({
        messageId: assistantMessageId,
        type: "citations",
        contentEncrypted: await encryptValue(JSON.stringify(citations)),
        metadataJson: null,
        sortOrder: nextSortOrder,
      })
      .returning({ id: messageParts.id });
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
    const [inserted] = await db
      .insert(messageParts)
      .values({
        messageId: assistantMessageId,
        type,
        contentEncrypted:
          type === "file"
            ? null
            : await encryptValue(JSON.stringify(metadata ?? null)),
        metadataJson: safeMetadata,
        sortOrder: nextSortOrder,
      })
      .returning({ id: messageParts.id });
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
