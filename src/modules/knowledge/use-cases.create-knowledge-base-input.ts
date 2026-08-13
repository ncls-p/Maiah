import {
  getDefaultRagConfig,
  hasSameRagModelSelection,
  inheritRagConfigDefaults,
  parseRagConfig,
  type RagConfig,
} from "@/modules/knowledge/rag-config";
import {
  applyResourceAccessSelection,
  type ResourceAccessScope,
} from "@/modules/iam/resource-access-scope";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { documents, knowledgeBases } from "@/server/infrastructure/db/schema";
import { and, inArray, isNull } from "drizzle-orm";

export interface CreateKnowledgeBaseInput {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string;
  isGlobal?: boolean;
  accessScope?: ResourceAccessScope;
  accessTeamId?: string;
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
  if (value === null) return getDefaultRagConfig();
  const config = parseRagConfig(value);
  if (
    config.embedding.modelId &&
    config.reranking.modelId &&
    config.extraction.ocr.modelId
  ) {
    return config;
  }
  return inheritRagConfigDefaults(config, await getDefaultRagConfig());
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
    authorization.hasDirectPermission(
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
    !(await authorization.hasDirectPermission(
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
    // Untouched (empty) model sections inherit the defaults, so they are not
    // a model change the caller needs permission for.
    const requested = inheritRagConfigDefaults(input.ragConfig, defaults);
    if (!hasSameRagModelSelection(requested, defaults)) {
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
      visibility:
        input.accessScope === "project"
          ? "workspace"
          : input.accessScope === "organization"
            ? "organization"
            : "private",
      createdById: input.userId,
    })
    .returning();

  if (input.accessScope) {
    await applyResourceAccessSelection({
      resourceType: "knowledge_base",
      resourceId: knowledgeBase.id,
      userId: input.userId,
      selection: { scope: input.accessScope, teamId: input.accessTeamId },
    });
  }

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
