import { db } from "@/server/infrastructure/db";
import {
  agentKnowledgeBindings,
  knowledgeBases,
} from "@/server/infrastructure/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { canViewKnowledgeBase } from "./use-cases.create-knowledge-base-input";

export async function getKnowledgeBindingsForVersion(
  agentVersionId: string,
  visibility?: {
    workspaceId: string;
    userId: string;
    additionalKnowledgeBaseIds?: string[];
  },
) {
  const rows = await db
    .select({
      id: agentKnowledgeBindings.id,
      knowledgeBaseId: agentKnowledgeBindings.knowledgeBaseId,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
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
            (await canViewKnowledgeBase(
              {
                id: row.knowledgeBaseId,
                createdById: row.createdById,
                isGlobal: row.isGlobal,
              },
              visibility.userId,
            ))
              ? row
              : null,
          ),
        )
      ).filter((row) => row !== null)
    : rows;
  const result = visibleRows.map(
    ({ id, knowledgeBaseId, name, description }) => ({
      id,
      knowledgeBaseId,
      name,
      description,
    }),
  );
  const additionalIds =
    visibility?.additionalKnowledgeBaseIds?.filter(
      (id) => !result.some((item) => item.knowledgeBaseId === id),
    ) ?? [];
  if (!visibility || additionalIds.length === 0) return result;
  const extraRows = await db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
      createdById: knowledgeBases.createdById,
      isGlobal: knowledgeBases.isGlobal,
    })
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.workspaceId, visibility.workspaceId),
        isNull(knowledgeBases.archivedAt),
        inArray(knowledgeBases.id, additionalIds),
      ),
    );
  const visibleExtraRows = (
    await Promise.all(
      extraRows.map(async (row) =>
        (await canViewKnowledgeBase(row, visibility.userId)) ? row : null,
      ),
    )
  ).filter((row) => row !== null);
  return [
    ...result,
    ...visibleExtraRows.map((row) => ({
      id: `chat:${row.id}`,
      knowledgeBaseId: row.id,
      name: row.name,
      description: row.description,
    })),
  ];
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
