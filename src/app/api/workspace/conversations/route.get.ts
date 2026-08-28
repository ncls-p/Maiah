import {
  handleRoute,
  requireRequestPermissionScopeAsync,
} from "@/lib/route-handler";
import {
  hasResourcePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";
import { RESPONSE_VERSION_BRANCH_KIND } from "@/modules/chat/conversation-branches";
import { db } from "@/server/infrastructure/db";
import { listDirectlyBoundResourceIds } from "@/server/infrastructure/db/access-resource-repository";
import {
  agents,
  conversationShares,
  conversations,
} from "@/server/infrastructure/db/schema";
import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { parseConversationCursor, querySchema } from "./route.query-schema";
import { fetchConversationList } from "./route.get.part-a";
import { attachConversationActivities } from "./route.get.part-b";
import { buildConversationMetaResponse } from "./route.get.part-c";

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { searchParams } = req.nextUrl;
      const parsed = querySchema.safeParse({
        agentId: searchParams.get("agentId") ?? undefined,
        workspaceId: searchParams.get("workspaceId") ?? undefined,
        before: searchParams.get("before") ?? undefined,
        q: searchParams.get("q") ?? undefined,
        includeMeta: searchParams.get("includeMeta") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
      });
      const hasConversationScope =
        parsed.success &&
        Boolean(parsed.data.workspaceId || parsed.data.agentId);
      if (!hasConversationScope) {
        return NextResponse.json(
          { error: "workspaceId or agentId must be a valid UUID" },
          { status: 400 },
        );
      }
      const { agentId, includeMeta, limit, q } = parsed.data;
      let workspaceId = parsed.data.workspaceId ?? null;
      const cursor = parseConversationCursor(parsed.data.before);
      if (parsed.data.before && !cursor) {
        return NextResponse.json(
          { error: "before must be a valid conversation cursor" },
          { status: 400 },
        );
      }
      if (!workspaceId && agentId) {
        const [agent] = await db
          .select({ workspaceId: agents.workspaceId })
          .from(agents)
          .where(and(eq(agents.id, agentId), isNull(agents.archivedAt)))
          .limit(1);
        if (!agent) {
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 },
          );
        }
        workspaceId = agent.workspaceId;
      }
      if (!workspaceId) {
        return NextResponse.json(
          { error: "workspaceId or agentId must be a valid UUID" },
          { status: 400 },
        );
      }
      const scopeForbidden = await requireRequestPermissionScopeAsync(
        session.user.id,
        workspaceId,
        "conversations.viewOwn",
      );
      if (scopeForbidden) return scopeForbidden;
      if (!(await isWorkspaceMemberForRequest(session.user.id, workspaceId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const directlyBoundIds = await listDirectlyBoundResourceIds(
        session.user.id,
        "conversation",
      );
      const directlyAccessibleIds = (
        await Promise.all(
          directlyBoundIds.map(async (conversationId) => ({
            conversationId,
            granted: await hasResourcePermissionForRequest(
              session.user.id,
              workspaceId,
              "conversations.viewOwn",
              "conversation",
              conversationId,
            ),
          })),
        )
      )
        .filter(({ granted }) => granted)
        .map(({ conversationId }) => conversationId);
      const sharedRows = await db
        .select({ conversationId: conversationShares.conversationId })
        .from(conversationShares)
        .where(eq(conversationShares.sharedWithUserId, session.user.id));
      const accessibleIds = [
        ...new Set([
          ...directlyAccessibleIds,
          ...sharedRows.map((row) => row.conversationId),
        ]),
      ];
      const visibleConversationCondition = accessibleIds.length
        ? or(
            eq(conversations.userId, session.user.id),
            inArray(conversations.id, accessibleIds),
          )
        : eq(conversations.userId, session.user.id);
      const scopeConditions = [
        eq(conversations.workspaceId, workspaceId),
        visibleConversationCondition,
        eq(conversations.status, "active"),
        isNull(conversations.archivedAt),
        or(
          isNull(conversations.branchKind),
          sql`${conversations.branchKind} <> ${RESPONSE_VERSION_BRANCH_KIND}`,
        )!,
      ];
      if (agentId) {
        scopeConditions.push(eq(conversations.agentId, agentId));
      }
      const conditions = [...scopeConditions];
      if (cursor) {
        const updatedAfterCursor = or(
          lt(conversations.updatedAt, cursor.updatedAt),
          and(
            eq(conversations.updatedAt, cursor.updatedAt),
            lt(conversations.id, cursor.id),
          ),
        );
        let cursorCondition = updatedAfterCursor;
        if (!q && cursor.version === 2) {
          const laterWithinPinnedGroup =
            cursor.sidebarOrder === null
              ? or(
                  isNotNull(conversations.sidebarOrder),
                  and(isNull(conversations.sidebarOrder), updatedAfterCursor),
                )
              : and(
                  isNotNull(conversations.sidebarOrder),
                  or(
                    gt(conversations.sidebarOrder, cursor.sidebarOrder),
                    and(
                      eq(conversations.sidebarOrder, cursor.sidebarOrder),
                      updatedAfterCursor,
                    ),
                  ),
                );
          cursorCondition = cursor.pinned
            ? or(
                isNull(conversations.pinnedAt),
                and(isNotNull(conversations.pinnedAt), laterWithinPinnedGroup),
              )
            : and(isNull(conversations.pinnedAt), laterWithinPinnedGroup);
        }
        if (cursorCondition) conditions.push(cursorCondition);
      }
      const conversationSelection = {
        id: conversations.id,
        title: conversations.title,
        agentId: conversations.agentId,
        agentVersionId: conversations.agentVersionId,
        folderId: conversations.folderId,
        pinnedAt: conversations.pinnedAt,
        sidebarOrder: conversations.sidebarOrder,
        isEphemeral: conversations.isEphemeral,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        isOwner: sql<boolean>`${conversations.userId} = ${session.user.id}`,
      };
      const { list, hasMore } = await fetchConversationList({
        conversationSelection,
        conditions,
        q,
        limit,
      });
      const liveList = await attachConversationActivities({
        list,
        userId: session.user.id,
      });
      const metaResponse = await buildConversationMetaResponse({
        includeMeta,
        scopeConditions,
        workspaceId,
        userId: session.user.id,
        liveList,
        hasMore,
        list,
      });
      if (metaResponse) return metaResponse;
      return NextResponse.json(liveList);
    },
    { logLabel: "Failed to list conversations" },
  );
}
