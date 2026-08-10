import { encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { enqueueDocumentIngestion } from "@/modules/knowledge/queue";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { documentChunks, documents } from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { storage } from "@/server/infrastructure/storage";
import {
  assertCanManageKnowledgeBase,
  effectiveRagConfig,
} from "./use-cases.create-knowledge-base-input";
import { getKnowledgeBase } from "./use-cases.list-knowledge-bases";

export function chunkText(
  text: string,
  options: { maxCharacters: number; overlapCharacters: number },
) {
  const maxChars = options.maxCharacters;
  const overlap = Math.min(options.overlapCharacters, maxChars - 1);
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);
    if (end < normalized.length) {
      const window = normalized.slice(start, end);
      const paragraphBreak = window.lastIndexOf("\n\n");
      const sentenceBreak = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
      );
      const naturalBreak = Math.max(paragraphBreak, sentenceBreak);
      if (naturalBreak >= Math.floor(maxChars * 0.55)) {
        end = start + naturalBreak + (naturalBreak === paragraphBreak ? 2 : 1);
      }
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

export async function ingestTextDocument(input: {
  workspaceId: string;
  knowledgeBaseId: string;
  userId: string;
  title: string;
  content: string;
  sourceType?: "text" | "url" | "upload";
  mimeType?: string;
  originalBytes?: Uint8Array;
  originalMimeType?: string;
  canManageGlobal?: boolean;
}) {
  const knowledgeBase = await getKnowledgeBase(
    input.knowledgeBaseId,
    input.workspaceId,
  );
  if (!knowledgeBase) throw new Error("Knowledge base not found");
  await assertCanManageKnowledgeBase(
    knowledgeBase,
    input.userId,
    input.canManageGlobal,
  );

  const config = await effectiveRagConfig(knowledgeBase.ragConfigJson);
  const chunks = chunkText(input.content, config.chunking);
  const document = await db.transaction(async (tx) => {
    const [document] = await tx
      .insert(documents)
      .values({
        workspaceId: input.workspaceId,
        knowledgeBaseId: input.knowledgeBaseId,
        title: input.title,
        sourceType: input.sourceType ?? "text",
        mimeType: input.mimeType ?? "text/plain",
        status: "processing",
        processingProgress: 20,
        processingStage: "chunked",
        createdById: input.userId,
      })
      .returning();

    if (chunks.length > 0) {
      await tx.insert(documentChunks).values(
        await Promise.all(
          chunks.map(async (chunk, index) => ({
            documentId: document.id,
            chunkIndex: index,
            contentEncrypted: await encryptValue(chunk),
            tokenCount: Math.ceil(chunk.length / 4),
            metadataJson: { source: input.sourceType ?? "text" },
          })),
        ),
      );
    }

    if (chunks.length === 0) {
      const [failed] = await tx
        .update(documents)
        .set({
          status: "failed",
          processingProgress: 100,
          processingStage: "failed",
          errorMessage: "Document was empty",
          updatedAt: new Date(),
        })
        .where(eq(documents.id, document.id))
        .returning();
      return failed;
    }

    return document;
  });

  if (
    input.originalBytes &&
    (input.originalMimeType === "application/pdf" ||
      input.title.toLowerCase().endsWith(".pdf"))
  ) {
    try {
      const objectStorageKey = `knowledge/${input.workspaceId}/${document.id}/source.pdf`;
      await storage.upload(
        objectStorageKey,
        input.originalBytes,
        "application/pdf",
      );
      await db
        .update(documents)
        .set({
          objectStorageKey,
          mimeType: "application/pdf",
          updatedAt: new Date(),
        })
        .where(eq(documents.id, document.id));
    } catch (error) {
      logger.warn(
        "Knowledge PDF source could not be stored for native preview",
        {
          documentId: document.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "document.ingested",
    resourceType: "knowledge_base",
    resourceId: input.knowledgeBaseId,
    outcome: document.status === "failed" ? "failed" : "success",
    metadata: { documentId: document.id, chunks: chunks.length },
  });

  if (document.status === "processing") {
    try {
      await enqueueDocumentIngestion({
        documentId: document.id,
        workspaceId: input.workspaceId,
        knowledgeBaseId: input.knowledgeBaseId,
      });
    } catch (error) {
      // PostgreSQL remains the source of truth. The worker periodically
      // reconciles processing rows, so a temporary Redis outage loses no job.
      logger.warn("Document ingestion will be recovered by the worker", {
        documentId: document.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return document;
}
