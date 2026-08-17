import { eq, sql } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import { conversations } from "@/server/infrastructure/db/schema";

const RESPONSE_VERSION_BRANCH_KIND = "response_version";
const MAX_RESPONSE_VERSION_DEPTH = 64;

export type ResponseVersionDescendant = {
  id: string;
  parentConversationId: string;
  rootConversationId: string;
};

export async function listActiveResponseVersionDescendants(
  rootConversationIds: string[],
) {
  if (rootConversationIds.length === 0) return [];
  const result = await db.execute<ResponseVersionDescendant>(sql`
    WITH RECURSIVE response_versions AS (
      SELECT
        child.id,
        child.parent_conversation_id AS "parentConversationId",
        child.parent_conversation_id AS "rootConversationId",
        1 AS depth
      FROM ${conversations} AS child
      WHERE
        child.parent_conversation_id = ANY(${sql.param(rootConversationIds)}::uuid[])
        AND child.branch_kind = ${RESPONSE_VERSION_BRANCH_KIND}
        AND child.status = 'active'
        AND child.archived_at IS NULL
      UNION ALL
      SELECT
        child.id,
        child.parent_conversation_id AS "parentConversationId",
        lineage."rootConversationId",
        lineage.depth + 1
      FROM ${conversations} AS child
      INNER JOIN response_versions AS lineage
        ON child.parent_conversation_id = lineage.id
      WHERE
        child.branch_kind = ${RESPONSE_VERSION_BRANCH_KIND}
        AND child.status = 'active'
        AND child.archived_at IS NULL
        AND lineage.depth < ${MAX_RESPONSE_VERSION_DEPTH}
    )
    SELECT id, "parentConversationId", "rootConversationId"
    FROM response_versions
  `);
  return result.rows;
}

export async function resolveResponseVersionRootId(input: {
  id: string;
  parentConversationId: string | null;
  branchKind: string | null;
}) {
  let current = input;
  const visited = new Set<string>();

  for (let depth = 0; depth < MAX_RESPONSE_VERSION_DEPTH; depth += 1) {
    if (
      current.branchKind !== RESPONSE_VERSION_BRANCH_KIND ||
      !current.parentConversationId
    ) {
      return current.id;
    }
    if (visited.has(current.id)) {
      throw new Error("Response-version lineage contains a cycle");
    }
    visited.add(current.id);
    const [parent] = await db
      .select({
        id: conversations.id,
        parentConversationId: conversations.parentConversationId,
        branchKind: conversations.branchKind,
      })
      .from(conversations)
      .where(eq(conversations.id, current.parentConversationId))
      .limit(1);
    if (!parent) return current.id;
    current = parent;
  }

  throw new Error("Response-version lineage exceeds the supported depth");
}
