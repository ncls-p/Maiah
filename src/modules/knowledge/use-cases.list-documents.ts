import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { cosineSimilarity, embed, embedMany, rerank } from "ai";
import { encryptValue, decryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import {
  enqueueDocumentIngestion,
  recoverDocumentIngestionJob,
} from "@/modules/knowledge/queue";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agentKnowledgeBindings,
  documentChunks,
  documentEmbeddings,
  documents,
  knowledgeBases,
} from "@/server/infrastructure/db/schema";
import {
  getDefaultRagConfig,
  hasSameRagModelSelection,
  parseRagConfig,
  ragConfigSchema,
  resolveEmbeddingModel,
  resolveRerankingModel,
  type RagConfig,
} from "@/modules/knowledge/rag-config";
import { getKnowledgeBase } from "./use-cases.list-knowledge-bases";
import { assertCanManageKnowledgeBase } from "./use-cases.create-knowledge-base-input";

export async function listDocuments(
  knowledgeBaseId: string,
  workspaceId: string,
  userId?: string,
) {
  const knowledgeBase = await getKnowledgeBase(
    knowledgeBaseId,
    workspaceId,
    userId,
  );
  if (!knowledgeBase) throw new Error("Knowledge base not found");
  return db
    .select({
      document: documents,
      chunkCount: sql<number>`count(distinct ${documentChunks.id})::int`,
      embeddingCount: sql<number>`count(distinct ${documentEmbeddings.id})::int`,
    })
    .from(documents)
    .leftJoin(documentChunks, eq(documentChunks.documentId, documents.id))
    .leftJoin(
      documentEmbeddings,
      eq(documentEmbeddings.chunkId, documentChunks.id),
    )
    .where(
      and(
        eq(documents.knowledgeBaseId, knowledgeBaseId),
        eq(documents.workspaceId, workspaceId),
      ),
    )
    .groupBy(documents.id)
    .orderBy(sql`${documents.createdAt} DESC`)
    .then((rows) =>
      rows.map(({ document, chunkCount, embeddingCount }) => ({
        ...document,
        processingProgress:
          document.status === "ready" || document.status === "failed"
            ? 100
            : chunkCount > 0 && embeddingCount > 0
              ? Math.max(
                  document.processingProgress,
                  20 + Math.round((embeddingCount / chunkCount) * 75),
                )
              : document.processingProgress,
      })),
    );
}

export async function archiveDocument(input: {
  documentId: string;
  knowledgeBaseId: string;
  workspaceId: string;
  userId: string;
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

  const [document] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.knowledgeBaseId, input.knowledgeBaseId),
        eq(documents.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!document) throw new Error("Document not found");

  await db.delete(documents).where(eq(documents.id, input.documentId));

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "document.archived",
    resourceType: "knowledge_base",
    resourceId: input.knowledgeBaseId,
    outcome: "success",
    metadata: { documentId: input.documentId, title: document.title },
  });
}

export async function retryDocumentIngestion(input: {
  documentId: string;
  knowledgeBaseId: string;
  workspaceId: string;
  userId: string;
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

  const [document] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.knowledgeBaseId, input.knowledgeBaseId),
        eq(documents.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!document) throw new Error("Document not found");
  if (document.status !== "failed") {
    throw new Error("Only failed documents can be retried");
  }

  await db
    .update(documents)
    .set({
      status: "processing",
      processingProgress: Math.min(document.processingProgress, 20),
      processingStage: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, input.documentId));

  try {
    await recoverDocumentIngestionJob({
      documentId: document.id,
      workspaceId: document.workspaceId,
      knowledgeBaseId: document.knowledgeBaseId,
    });
  } catch (error) {
    logger.warn("Document retry will be recovered by the worker", {
      documentId: document.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function scoreContent(content: string, query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = content.toLowerCase();
  return terms.reduce(
    (score, term) => score + (lower.includes(term) ? 1 : 0),
    0,
  );
}

export type KnowledgeSearchHit = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkIndex: number;
  content: string;
  score: number;
};
