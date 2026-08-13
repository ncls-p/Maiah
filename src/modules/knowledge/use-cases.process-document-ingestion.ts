import { decryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { resolveEmbeddingModel } from "@/modules/knowledge/rag-config";
import { db } from "@/server/infrastructure/db";
import {
  documentChunks,
  documentEmbeddings,
  documents,
  knowledgeBases,
} from "@/server/infrastructure/db/schema";
import { embedMany } from "ai";
import { eq, inArray } from "drizzle-orm";
import { effectiveRagConfig } from "./use-cases.create-knowledge-base-input";

export async function processDocumentIngestion(documentId: string) {
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document || document.status !== "processing") return;

  const chunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId));

  const [knowledgeBase] = await db
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.id, document.knowledgeBaseId))
    .limit(1);
  const config = await effectiveRagConfig(knowledgeBase?.ragConfigJson);
  const embeddingSelection = await resolveEmbeddingModel(
    document.workspaceId,
    config,
  );

  if (chunks.length > 0 && embeddingSelection) {
    await db
      .update(documents)
      .set({ processingStage: "embedding", processingProgress: 20 })
      .where(eq(documents.id, documentId));
    await db.delete(documentEmbeddings).where(
      inArray(
        documentEmbeddings.chunkId,
        chunks.map((chunk) => chunk.id),
      ),
    );

    const batchSize = 16;
    for (let offset = 0; offset < chunks.length; offset += batchSize) {
      const batch = chunks.slice(offset, offset + batchSize);
      const values = await Promise.all(
        batch.map((chunk) =>
          chunk.contentEncrypted
            ? decryptValue(chunk.contentEncrypted)
            : Promise.resolve(""),
        ),
      );
      const result = await embedMany({
        model: embeddingSelection.model,
        values,
        maxParallelCalls: 2,
        maxRetries: 2,
        abortSignal: AbortSignal.timeout(120_000),
        providerOptions: config.embedding.dimensions
          ? {
              [embeddingSelection.model.provider]: {
                dimensions: config.embedding.dimensions,
              },
            }
          : undefined,
      });
      await db.insert(documentEmbeddings).values(
        batch.map((chunk, index) => ({
          chunkId: chunk.id,
          embeddingJson: result.embeddings[index],
          embeddingDimensions: result.embeddings[index]?.length ?? null,
          embeddingModelId: config.embedding.modelId,
        })),
      );
      const completed = Math.min(offset + batch.length, chunks.length);
      await db
        .update(documents)
        .set({
          processingProgress: 20 + Math.round((completed / chunks.length) * 75),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));
    }
  }

  const embeddingSkipped = chunks.length > 0 && !embeddingSelection;
  if (embeddingSkipped) {
    logger.warn(
      "Embedding model unavailable; document indexed for keyword search only",
      {
        documentId,
        knowledgeBaseId: document.knowledgeBaseId,
        workspaceId: document.workspaceId,
        embeddingModelId: config.embedding.modelId,
        embeddingProviderId: config.embedding.providerId,
      },
    );
  }

  await db
    .update(documents)
    .set({
      status: chunks.length > 0 ? "ready" : "failed",
      processingProgress: 100,
      processingStage: chunks.length > 0 ? "ready" : "failed",
      errorMessage:
        chunks.length > 0
          ? embeddingSkipped
            ? "Embedding model unavailable; indexed for keyword search only"
            : null
          : "No chunks generated",
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}
