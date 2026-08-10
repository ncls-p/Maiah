import { decryptValue } from "@/lib/crypto";
import { db } from "@/server/infrastructure/db";
import {
  documentChunks,
  documents,
  knowledgeBases,
} from "@/server/infrastructure/db/schema";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getKnowledgeBindingsForVersion } from "./use-cases.get-knowledge-bindings-for-version";
import { searchKnowledgeBase } from "./use-cases.search-knowledge-base";

export async function searchBoundKnowledgeBases(input: {
  agentVersionId: string;
  workspaceId: string;
  knowledgeBaseIds: string[];
  query: string;
  limit?: number;
  userId?: string;
}) {
  const bindings = await getKnowledgeBindingsForVersion(
    input.agentVersionId,
    input.userId
      ? { workspaceId: input.workspaceId, userId: input.userId }
      : undefined,
  );
  if (bindings.length === 0) return [];

  const requestedIds = new Set(input.knowledgeBaseIds);
  const selectedBindings = bindings.filter((binding) =>
    requestedIds.has(binding.knowledgeBaseId),
  );
  if (selectedBindings.length !== requestedIds.size) {
    throw new Error("One or more selected data sources are not available");
  }

  const perBaseLimit = Math.max(
    1,
    Math.ceil((input.limit ?? 5) / selectedBindings.length),
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

  for (const binding of selectedBindings) {
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

const MAX_BOUND_CONTEXT_CHARS = 40_000;

/**
 * Reads a bounded window around a chunk returned by the agent knowledge search.
 * The active version binding and the initiating user's visibility are checked
 * again at execution time so a stale chunk id cannot bypass knowledge access.
 */
export async function readBoundKnowledgeChunkWindow(input: {
  agentVersionId: string;
  workspaceId: string;
  userId: string;
  chunkId: string;
  before?: number;
  after?: number;
}) {
  const bindings = await getKnowledgeBindingsForVersion(input.agentVersionId, {
    workspaceId: input.workspaceId,
    userId: input.userId,
  });
  if (bindings.length === 0) return null;

  const [anchor] = await db
    .select({
      chunkId: documentChunks.id,
      chunkIndex: documentChunks.chunkIndex,
      documentId: documents.id,
      documentTitle: documents.title,
      knowledgeBaseId: knowledgeBases.id,
      knowledgeBaseName: knowledgeBases.name,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .innerJoin(knowledgeBases, eq(documents.knowledgeBaseId, knowledgeBases.id))
    .where(
      and(
        eq(documentChunks.id, input.chunkId),
        eq(documents.workspaceId, input.workspaceId),
        eq(documents.status, "ready"),
        inArray(
          knowledgeBases.id,
          bindings.map((binding) => binding.knowledgeBaseId),
        ),
        isNull(knowledgeBases.archivedAt),
      ),
    )
    .limit(1);
  if (!anchor) return null;

  const before = Math.max(0, Math.min(5, input.before ?? 2));
  const after = Math.max(0, Math.min(5, input.after ?? 2));
  const rows = await db
    .select({
      chunkId: documentChunks.id,
      chunkIndex: documentChunks.chunkIndex,
      contentEncrypted: documentChunks.contentEncrypted,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, anchor.documentId),
        gte(documentChunks.chunkIndex, Math.max(0, anchor.chunkIndex - before)),
        lte(documentChunks.chunkIndex, anchor.chunkIndex + after),
      ),
    )
    .orderBy(asc(documentChunks.chunkIndex));

  let remainingCharacters = MAX_BOUND_CONTEXT_CHARS;
  let truncated = false;
  const chunks: Array<{
    chunkId: string;
    chunkIndex: number;
    content: string;
    isAnchor: boolean;
  }> = [];
  for (const row of rows) {
    if (!row.contentEncrypted) continue;
    if (remainingCharacters <= 0) {
      truncated = true;
      break;
    }
    const decrypted = await decryptValue(row.contentEncrypted);
    const content = decrypted.slice(0, remainingCharacters);
    if (content.length < decrypted.length) truncated = true;
    remainingCharacters -= content.length;
    chunks.push({
      chunkId: row.chunkId,
      chunkIndex: row.chunkIndex,
      content,
      isAnchor: row.chunkId === anchor.chunkId,
    });
  }

  return {
    anchorChunkId: anchor.chunkId,
    documentId: anchor.documentId,
    documentTitle: anchor.documentTitle,
    knowledgeBaseId: anchor.knowledgeBaseId,
    knowledgeBaseName: anchor.knowledgeBaseName,
    chunks,
    truncated,
  };
}
