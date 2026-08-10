import { decryptValue } from "@/lib/crypto";
import { db } from "@/server/infrastructure/db";
import { documentChunks, documents } from "@/server/infrastructure/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getKnowledgeBase } from "./use-cases.list-knowledge-bases";

export async function readKnowledgeDocument(input: { documentId: string; knowledgeBaseId: string; workspaceId: string; userId: string }) {
  const knowledgeBase = await getKnowledgeBase(input.knowledgeBaseId, input.workspaceId, input.userId);
  if (!knowledgeBase) return null;

  const [document] = await db
    .select({
      id: documents.id,
      title: documents.title,
      mimeType: documents.mimeType,
      objectStorageKey: documents.objectStorageKey,
    })
    .from(documents)
    .where(and(eq(documents.id, input.documentId), eq(documents.knowledgeBaseId, input.knowledgeBaseId), eq(documents.workspaceId, input.workspaceId), eq(documents.status, "ready")))
    .limit(1);
  if (!document) return null;

  const rows = await db
    .select({
      chunkId: documentChunks.id,
      chunkIndex: documentChunks.chunkIndex,
      contentEncrypted: documentChunks.contentEncrypted,
    })
    .from(documentChunks)
    .where(eq(documentChunks.documentId, document.id))
    .orderBy(asc(documentChunks.chunkIndex));

  const chunks = await Promise.all(
    rows.map(async (row) => ({
      chunkId: row.chunkId,
      chunkIndex: row.chunkIndex,
      content: row.contentEncrypted ? await decryptValue(row.contentEncrypted) : "",
    })),
  );

  return {
    documentId: document.id,
    documentTitle: document.title,
    mimeType: document.mimeType,
    originalUrl: document.mimeType === "application/pdf" && document.objectStorageKey ? `/api/workspace/knowledge-bases/${input.knowledgeBaseId}/documents/${document.id}/raw?workspaceId=${input.workspaceId}` : null,
    knowledgeBaseId: knowledgeBase.id,
    knowledgeBaseName: knowledgeBase.name,
    chunks,
  };
}

export async function listProcessingDocuments(limit = 5) {
  const processingDocuments = await db
    .select({
      id: documents.id,
      workspaceId: documents.workspaceId,
      knowledgeBaseId: documents.knowledgeBaseId,
    })
    .from(documents)
    .where(eq(documents.status, "processing"))
    .limit(limit);
  return processingDocuments;
}

export async function recordDocumentIngestionAttemptFailure(documentId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(documents)
    .set({
      processingStage: "retrying",
      errorMessage: message.slice(0, 4_000),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, documentId), eq(documents.status, "processing")));
}

export async function markDocumentIngestionFailed(documentId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(documents)
    .set({
      status: "failed",
      processingProgress: 100,
      processingStage: "failed",
      errorMessage: message.slice(0, 4_000),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, documentId), eq(documents.status, "processing")));
}
