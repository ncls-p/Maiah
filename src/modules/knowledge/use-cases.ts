import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
  parseRagConfig,
  ragConfigSchema,
  resolveEmbeddingModel,
  resolveRerankingModel,
  type RagConfig,
} from "@/modules/knowledge/rag-config";

export interface CreateKnowledgeBaseInput {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string;
  isGlobal?: boolean;
  ragConfig?: RagConfig;
}

type KnowledgeBaseRow = typeof knowledgeBases.$inferSelect;

async function effectiveRagConfig(value: unknown) {
  return value === null ? getDefaultRagConfig() : parseRagConfig(value);
}

function canManageKnowledgeBase(
  knowledgeBase: KnowledgeBaseRow,
  userId: string,
  canManageGlobal = false,
) {
  return (
    knowledgeBase.createdById === userId ||
    (knowledgeBase.isGlobal && canManageGlobal)
  );
}

async function canViewKnowledgeBase(
  knowledgeBase: Pick<KnowledgeBaseRow, "id" | "createdById" | "isGlobal">,
  userId: string,
) {
  return (
    knowledgeBase.createdById === userId ||
    knowledgeBase.isGlobal ||
    authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "knowledgeBases.viewAllowed",
      "knowledge_base",
      knowledgeBase.id,
    )
  );
}

async function assertCanManageKnowledgeBase(
  knowledgeBase: KnowledgeBaseRow,
  userId: string,
  canManageGlobal = false,
) {
  if (
    !canManageKnowledgeBase(knowledgeBase, userId, canManageGlobal) &&
    !(await authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "knowledgeBases.manage",
      "knowledge_base",
      knowledgeBase.id,
    ))
  ) {
    throw new Error("Knowledge base not found");
  }
}

export async function createKnowledgeBase(input: CreateKnowledgeBaseInput) {
  const [knowledgeBase] = await db
    .insert(knowledgeBases)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description || null,
      ragConfigJson: input.ragConfig ?? null,
      isGlobal: input.isGlobal ?? false,
      createdById: input.userId,
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "knowledgeBase.created",
    resourceType: "knowledge_base",
    resourceId: knowledgeBase.id,
    outcome: "success",
    metadata: { name: input.name },
  });

  return knowledgeBase;
}

export async function queueDefaultRagReindex() {
  const inheritedBases = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(
      and(
        isNull(knowledgeBases.ragConfigJson),
        isNull(knowledgeBases.archivedAt),
      ),
    );
  if (inheritedBases.length === 0) return 0;
  const updated = await db
    .update(documents)
    .set({ status: "processing", errorMessage: null, updatedAt: new Date() })
    .where(
      inArray(
        documents.knowledgeBaseId,
        inheritedBases.map((base) => base.id),
      ),
    )
    .returning({ id: documents.id });
  return updated.length;
}

export async function listKnowledgeBases(
  workspaceId: string,
  userId?: string,
  canManageGlobal = false,
) {
  const rows = await db
    .select()
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.workspaceId, workspaceId),
        isNull(knowledgeBases.archivedAt),
      ),
    )
    .orderBy(
      sql`${knowledgeBases.isGlobal} DESC`,
      sql`${knowledgeBases.createdAt} DESC`,
    );
  const defaultRagConfig = rows.some(
    (knowledgeBase) => knowledgeBase.ragConfigJson === null,
  )
    ? await getDefaultRagConfig()
    : null;
  const withRagConfig = (knowledgeBase: KnowledgeBaseRow) => ({
    ...knowledgeBase,
    effectiveRagConfig: parseRagConfig(
      knowledgeBase.ragConfigJson === null
        ? defaultRagConfig
        : knowledgeBase.ragConfigJson,
    ),
    usesDefaultRagConfig: knowledgeBase.ragConfigJson === null,
  });
  if (!userId) {
    return rows.map((knowledgeBase) => ({
      ...withRagConfig(knowledgeBase),
      canEdit: true,
    }));
  }
  return (
    await Promise.all(
      rows.map(async (knowledgeBase) => {
        const visible = await canViewKnowledgeBase(knowledgeBase, userId);
        if (!visible) return null;
        const canEdit =
          canManageKnowledgeBase(knowledgeBase, userId, canManageGlobal) ||
          (await authorization.hasPermission(
            { principalType: "user", principalId: userId },
            "knowledgeBases.manage",
            "knowledge_base",
            knowledgeBase.id,
          ));
        return { ...withRagConfig(knowledgeBase), canEdit };
      }),
    )
  ).filter((knowledgeBase) => knowledgeBase !== null);
}

export async function getKnowledgeBase(
  knowledgeBaseId: string,
  workspaceId: string,
  userId?: string,
) {
  const [knowledgeBase] = await db
    .select()
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.id, knowledgeBaseId),
        eq(knowledgeBases.workspaceId, workspaceId),
        isNull(knowledgeBases.archivedAt),
      ),
    )
    .limit(1);
  if (
    knowledgeBase &&
    userId &&
    knowledgeBase.createdById !== userId &&
    !knowledgeBase.isGlobal &&
    !(await authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "knowledgeBases.viewAllowed",
      "knowledge_base",
      knowledgeBase.id,
    ))
  ) {
    return null;
  }
  return knowledgeBase ?? null;
}

export async function updateKnowledgeBase(input: {
  knowledgeBaseId: string;
  workspaceId: string;
  userId: string;
  canManageGlobal?: boolean;
  name?: string;
  description?: string;
  isGlobal?: boolean;
  ragConfig?: RagConfig | null;
}) {
  const existing = await getKnowledgeBase(
    input.knowledgeBaseId,
    input.workspaceId,
  );
  if (!existing) throw new Error("Knowledge base not found");
  await assertCanManageKnowledgeBase(
    existing,
    input.userId,
    input.canManageGlobal,
  );
  if (input.isGlobal && !input.canManageGlobal) {
    throw new Error("Only admins can make knowledge bases global");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined)
    updates.description = input.description || null;
  if (input.isGlobal !== undefined) updates.isGlobal = input.isGlobal;
  if (input.ragConfig !== undefined) {
    updates.ragConfigJson = input.ragConfig
      ? ragConfigSchema.parse(input.ragConfig)
      : null;
  }

  const [knowledgeBase] = await db
    .update(knowledgeBases)
    .set(updates)
    .where(eq(knowledgeBases.id, input.knowledgeBaseId))
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "knowledgeBase.updated",
    resourceType: "knowledge_base",
    resourceId: input.knowledgeBaseId,
    outcome: "success",
  });

  return knowledgeBase;
}

export async function archiveKnowledgeBase(
  knowledgeBaseId: string,
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  const existing = await getKnowledgeBase(knowledgeBaseId, workspaceId);
  if (!existing) throw new Error("Knowledge base not found");
  await assertCanManageKnowledgeBase(existing, userId, canManageGlobal);
  await db
    .update(knowledgeBases)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(knowledgeBases.id, knowledgeBaseId));
  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "knowledgeBase.archived",
    resourceType: "knowledge_base",
    resourceId: knowledgeBaseId,
    outcome: "success",
  });
}

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

type KnowledgeSearchHit = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkIndex: number;
  content: string;
  score: number;
};

async function searchKnowledgeBaseByKeyword(input: {
  workspaceId: string;
  knowledgeBaseId: string;
  query: string;
  limit?: number;
}): Promise<KnowledgeSearchHit[]> {
  const rows = await db
    .select({ chunk: documentChunks, document: documents })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(
      and(
        eq(documents.knowledgeBaseId, input.knowledgeBaseId),
        eq(documents.workspaceId, input.workspaceId),
        eq(documents.status, "ready"),
      ),
    );

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

async function searchKnowledgeBaseByVector(input: {
  workspaceId: string;
  knowledgeBaseId: string;
  query: string;
  limit?: number;
  config: RagConfig;
}): Promise<KnowledgeSearchHit[] | null> {
  const config = input.config;
  const embeddingSelection = await resolveEmbeddingModel(
    input.workspaceId,
    config,
  );
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
    .innerJoin(
      documentChunks,
      eq(documentEmbeddings.chunkId, documentChunks.id),
    )
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(
      and(
        eq(documents.knowledgeBaseId, input.knowledgeBaseId),
        eq(documents.workspaceId, input.workspaceId),
        eq(documents.status, "ready"),
        eq(documentEmbeddings.embeddingModelId, config.embedding.modelId),
      ),
    );

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
      score: cosineSimilarity(
        queryResult.embedding,
        row.embedding.embeddingJson,
      ),
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
      topN: Math.min(
        input.limit ?? config.retrieval.resultCount,
        ranked.length,
      ),
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(30_000),
    });
    ranked = reranked.ranking.map((entry) => ({
      ...ranked[entry.originalIndex],
      score: entry.score,
    }));
  }
  return ranked.length > 0
    ? ranked.slice(0, input.limit ?? config.retrieval.resultCount)
    : null;
}

export async function searchKnowledgeBase(input: {
  workspaceId: string;
  knowledgeBaseId: string;
  query: string;
  limit?: number;
  userId?: string;
}) {
  const knowledgeBase = await getKnowledgeBase(
    input.knowledgeBaseId,
    input.workspaceId,
    input.userId,
  );
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

export async function getKnowledgeBindingsForVersion(
  agentVersionId: string,
  visibility?: { workspaceId: string; userId: string },
) {
  const rows = await db
    .select({
      id: agentKnowledgeBindings.id,
      knowledgeBaseId: agentKnowledgeBindings.knowledgeBaseId,
      name: knowledgeBases.name,
      createdById: knowledgeBases.createdById,
      isGlobal: knowledgeBases.isGlobal,
    })
    .from(agentKnowledgeBindings)
    .innerJoin(
      knowledgeBases,
      eq(agentKnowledgeBindings.knowledgeBaseId, knowledgeBases.id),
    )
    .where(
      visibility
        ? and(
            eq(agentKnowledgeBindings.agentVersionId, agentVersionId),
            eq(knowledgeBases.workspaceId, visibility.workspaceId),
            isNull(knowledgeBases.archivedAt),
          )
        : eq(agentKnowledgeBindings.agentVersionId, agentVersionId),
    );
  const visibleRows = visibility
    ? (
        await Promise.all(
          rows.map(async (row) =>
            (await canViewKnowledgeBase(row, visibility.userId)) ? row : null,
          ),
        )
      ).filter((row) => row !== null)
    : rows;
  return visibleRows.map(({ id, knowledgeBaseId, name }) => ({
    id,
    knowledgeBaseId,
    name,
  }));
}

type BindingDb = Pick<typeof db, "select" | "insert" | "delete">;

export async function replaceKnowledgeBindingsForVersion(
  agentVersionId: string,
  knowledgeBaseIds: string[],
  workspaceId?: string,
  options?: { userId?: string },
  executor: BindingDb = db,
) {
  const uniqueKnowledgeBaseIds = [...new Set(knowledgeBaseIds)];
  if (workspaceId && uniqueKnowledgeBaseIds.length > 0) {
    const availableKnowledgeBases = await executor
      .select({
        id: knowledgeBases.id,
        createdById: knowledgeBases.createdById,
        isGlobal: knowledgeBases.isGlobal,
      })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.workspaceId, workspaceId),
          isNull(knowledgeBases.archivedAt),
          inArray(knowledgeBases.id, uniqueKnowledgeBaseIds),
        ),
      );
    const visibleKnowledgeBases = options?.userId
      ? (
          await Promise.all(
            availableKnowledgeBases.map(async (knowledgeBase) =>
              (await canViewKnowledgeBase(knowledgeBase, options.userId!))
                ? knowledgeBase
                : null,
            ),
          )
        ).filter((knowledgeBase) => knowledgeBase !== null)
      : availableKnowledgeBases;
    const availableIds = new Set(
      visibleKnowledgeBases.map((knowledgeBase) => knowledgeBase.id),
    );
    const invalidKnowledgeBaseId = uniqueKnowledgeBaseIds.find(
      (knowledgeBaseId) => !availableIds.has(knowledgeBaseId),
    );
    if (invalidKnowledgeBaseId) throw new Error("Knowledge base not found");
  }

  await executor
    .delete(agentKnowledgeBindings)
    .where(eq(agentKnowledgeBindings.agentVersionId, agentVersionId));

  if (uniqueKnowledgeBaseIds.length === 0) return;

  await executor.insert(agentKnowledgeBindings).values(
    uniqueKnowledgeBaseIds.map((knowledgeBaseId) => ({
      agentVersionId,
      knowledgeBaseId,
    })),
  );
}

export async function cloneKnowledgeBindings(
  fromAgentVersionId: string | null,
  toAgentVersionId: string,
  workspaceId?: string,
  options?: { userId?: string },
  executor: BindingDb = db,
) {
  if (!fromAgentVersionId) return;
  const existing = await executor
    .select({
      knowledgeBaseId: agentKnowledgeBindings.knowledgeBaseId,
      id: knowledgeBases.id,
      createdById: knowledgeBases.createdById,
      isGlobal: knowledgeBases.isGlobal,
    })
    .from(agentKnowledgeBindings)
    .innerJoin(
      knowledgeBases,
      eq(agentKnowledgeBindings.knowledgeBaseId, knowledgeBases.id),
    )
    .where(
      workspaceId && options?.userId
        ? and(
            eq(agentKnowledgeBindings.agentVersionId, fromAgentVersionId),
            eq(knowledgeBases.workspaceId, workspaceId),
            isNull(knowledgeBases.archivedAt),
          )
        : eq(agentKnowledgeBindings.agentVersionId, fromAgentVersionId),
    );

  const visibleBindings =
    workspaceId && options?.userId
      ? (
          await Promise.all(
            existing.map(async (binding) =>
              (await canViewKnowledgeBase(binding, options.userId!))
                ? binding
                : null,
            ),
          )
        ).filter((binding) => binding !== null)
      : existing;
  if (visibleBindings.length === 0) return;

  await executor.insert(agentKnowledgeBindings).values(
    visibleBindings.map((row) => ({
      agentVersionId: toAgentVersionId,
      knowledgeBaseId: row.knowledgeBaseId,
    })),
  );
}

export async function searchBoundKnowledgeBases(input: {
  agentVersionId: string;
  workspaceId: string;
  query: string;
  limit?: number;
  userId?: string;
}) {
  const bindings = await getKnowledgeBindingsForVersion(input.agentVersionId);
  if (bindings.length === 0) return [];

  const perBaseLimit = Math.max(
    1,
    Math.ceil((input.limit ?? 5) / bindings.length),
  );
  const allResults: Array<{
    documentId: string;
    documentTitle: string;
    chunkId: string;
    chunkIndex: number;
    content: string;
    score: number;
    knowledgeBaseId: string;
    knowledgeBaseName: string;
  }> = [];

  for (const binding of bindings) {
    const hits = await searchKnowledgeBase({
      workspaceId: input.workspaceId,
      knowledgeBaseId: binding.knowledgeBaseId,
      query: input.query,
      limit: perBaseLimit,
      userId: input.userId,
    });
    for (const hit of hits) {
      allResults.push({
        ...hit,
        knowledgeBaseId: binding.knowledgeBaseId,
        knowledgeBaseName: binding.name,
      });
    }
  }

  return allResults
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 5);
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

export async function recordDocumentIngestionAttemptFailure(
  documentId: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(documents)
    .set({
      processingStage: "retrying",
      errorMessage: message.slice(0, 4_000),
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.id, documentId), eq(documents.status, "processing")),
    );
}

export async function markDocumentIngestionFailed(
  documentId: string,
  error: unknown,
) {
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
    .where(
      and(eq(documents.id, documentId), eq(documents.status, "processing")),
    );
}

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

  await db
    .update(documents)
    .set({
      status: chunks.length > 0 ? "ready" : "failed",
      processingProgress: 100,
      processingStage: chunks.length > 0 ? "ready" : "failed",
      errorMessage: chunks.length > 0 ? null : "No chunks generated",
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}
