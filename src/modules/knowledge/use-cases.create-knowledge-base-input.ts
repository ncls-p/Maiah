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

export interface CreateKnowledgeBaseInput {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string;
  isGlobal?: boolean;
  ragConfig?: RagConfig;
  canManageModels?: boolean;
}

export class RagModelConfigurationPermissionError extends Error {
  constructor() {
    super("Changing RAG models requires the models.manage permission");
    this.name = "RagModelConfigurationPermissionError";
  }
}

export type KnowledgeBaseRow = typeof knowledgeBases.$inferSelect;

export async function effectiveRagConfig(value: unknown) {
  return value === null ? getDefaultRagConfig() : parseRagConfig(value);
}

export function canManageKnowledgeBase(
  knowledgeBase: KnowledgeBaseRow,
  userId: string,
  canManageGlobal = false,
) {
  return (
    knowledgeBase.createdById === userId ||
    (knowledgeBase.isGlobal && canManageGlobal)
  );
}

export async function canViewKnowledgeBase(
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

export async function assertCanManageKnowledgeBase(
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
  if (input.ragConfig && !input.canManageModels) {
    const defaults = await getDefaultRagConfig();
    if (!hasSameRagModelSelection(input.ragConfig, defaults)) {
      throw new RagModelConfigurationPermissionError();
    }
  }
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
