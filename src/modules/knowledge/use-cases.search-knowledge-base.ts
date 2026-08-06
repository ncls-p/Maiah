import { decryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { resolveEmbeddingModel,resolveRerankingModel,type RagConfig } from "@/modules/knowledge/rag-config";
import { db } from "@/server/infrastructure/db";
import { documentChunks,documentEmbeddings,documents } from "@/server/infrastructure/db/schema";
import { cosineSimilarity,embed,rerank } from "ai";
import { and,eq } from "drizzle-orm";
import { effectiveRagConfig } from "./use-cases.create-knowledge-base-input";
import { KnowledgeSearchHit,scoreContent } from "./use-cases.list-documents";
import { getKnowledgeBase } from "./use-cases.list-knowledge-bases";

async function searchKnowledgeBaseByKeyword(input: { workspaceId: string; knowledgeBaseId: string; query: string; limit?: number }): Promise<KnowledgeSearchHit[]> {
  const rows = await db
    .select({ chunk: documentChunks, document: documents })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(eq(documents.knowledgeBaseId, input.knowledgeBaseId), eq(documents.workspaceId, input.workspaceId), eq(documents.status, "ready")));

  const results: KnowledgeSearchHit[] = [];
  for (const row of rows) {
    if (!row.chunk.contentEncrypted) continue;
    const content = await decryptValue(row.chunk.contentEncrypted);
    const score = scoreContent(content, input.query);
    if (score > 0) {
      results.push({
        documentId: row.document.id,
        documentTitle: row.document.title,
        chunkId: row.chunk.id,
        chunkIndex: row.chunk.chunkIndex,
        content,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, input.limit ?? 5);
}

async function searchKnowledgeBaseByVector(input: { workspaceId: string; knowledgeBaseId: string; query: string; limit?: number; config: RagConfig }): Promise<KnowledgeSearchHit[] | null> {
  const config = input.config;
  const embeddingSelection = await resolveEmbeddingModel(input.workspaceId, config);
  if (!embeddingSelection) return null;
  const queryResult = await embed({
    model: embeddingSelection.model,
    value: input.query,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(30_000),
    providerOptions: config.embedding.dimensions
      ? {
          [embeddingSelection.model.provider]: {
            dimensions: config.embedding.dimensions,
          },
        }
      : undefined,
  });
  const rows = await db
    .select({
      chunk: documentChunks,
      document: documents,
      embedding: documentEmbeddings,
    })
    .from(documentEmbeddings)
    .innerJoin(documentChunks, eq(documentEmbeddings.chunkId, documentChunks.id))
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(eq(documents.knowledgeBaseId, input.knowledgeBaseId), eq(documents.workspaceId, input.workspaceId), eq(documents.status, "ready"), eq(documentEmbeddings.embeddingModelId, config.embedding.modelId)));

  if (rows.length === 0) return null;

  const results: KnowledgeSearchHit[] = [];
  for (const row of rows) {
    if (!row.chunk.contentEncrypted || !row.embedding.embeddingJson) continue;
    if (row.embedding.embeddingJson.length !== queryResult.embedding.length) {
      continue;
    }
    const content = await decryptValue(row.chunk.contentEncrypted);
    results.push({
      documentId: row.document.id,
      documentTitle: row.document.title,
      chunkId: row.chunk.id,
      chunkIndex: row.chunk.chunkIndex,
      content,
      score: cosineSimilarity(queryResult.embedding, row.embedding.embeddingJson),
    });
  }
  let ranked = results
    .filter((hit) => hit.score >= config.retrieval.minimumScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, config.retrieval.candidateCount);
  const rerankingModel = await resolveRerankingModel(input.workspaceId, config);
  if (rerankingModel && ranked.length > 0) {
    const reranked = await rerank({
      model: rerankingModel,
      query: input.query,
      documents: ranked.map((hit) => hit.content),
      topN: Math.min(input.limit ?? config.retrieval.resultCount, ranked.length),
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(30_000),
    });
    ranked = reranked.ranking.map((entry) => ({
      ...ranked[entry.originalIndex],
      score: entry.score,
    }));
  }
  return ranked.length > 0 ? ranked.slice(0, input.limit ?? config.retrieval.resultCount) : null;
}

export async function searchKnowledgeBase(input: { workspaceId: string; knowledgeBaseId: string; query: string; limit?: number; userId?: string }) {
  const knowledgeBase = await getKnowledgeBase(input.knowledgeBaseId, input.workspaceId, input.userId);
  if (!knowledgeBase) throw new Error("Knowledge base not found");

  let vectorHits: KnowledgeSearchHit[] | null = null;
  try {
    vectorHits = await searchKnowledgeBaseByVector({
      ...input,
      config: await effectiveRagConfig(knowledgeBase.ragConfigJson),
    });
  } catch (error) {
    logger.warn("Vector knowledge search failed; using lexical fallback", {
      knowledgeBaseId: input.knowledgeBaseId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (vectorHits && vectorHits.length > 0) {
    return vectorHits;
  }

  return searchKnowledgeBaseByKeyword(input);
}
