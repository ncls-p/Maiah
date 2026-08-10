import {
  getDefaultRagConfig,
  hasSameRagModelSelection,
  parseRagConfig,
  ragConfigSchema,
  type RagConfig,
} from "@/modules/knowledge/rag-config";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { knowledgeBases } from "@/server/infrastructure/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  KnowledgeBaseRow,
  RagModelConfigurationPermissionError,
  assertCanManageKnowledgeBase,
  canManageKnowledgeBase,
  canViewKnowledgeBase,
  effectiveRagConfig,
} from "./use-cases.create-knowledge-base-input";

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
  canManageModels?: boolean;
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
  if (input.ragConfig && !input.canManageModels) {
    const currentConfig = await effectiveRagConfig(existing.ragConfigJson);
    if (!hasSameRagModelSelection(input.ragConfig, currentConfig)) {
      throw new RagModelConfigurationPermissionError();
    }
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
