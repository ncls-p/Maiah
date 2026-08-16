import { decryptValue } from "@/lib/crypto";
import {
  handleRoute,
  requireRequestPermissionScopeAsync,
} from "@/lib/route-handler";
import {
  hasResourcePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";
import {
  conversationSearchSnippet,
  conversationTextMatches,
} from "@/modules/chat/conversation-search";
import { db } from "@/server/infrastructure/db";
import { listDirectlyBoundResourceIds } from "@/server/infrastructure/db/access-resource-repository";
import {
  agents,
  conversationFolders,
  conversationShares,
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { createConversationCursor, querySchema } from "./route.query-schema";
import { RESPONSE_VERSION_BRANCH_KIND } from "@/modules/chat/conversation-branches";
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
      const [beforeDateValue, beforeId] = parsed.data.before?.split("|") ?? [];
      const before = beforeDateValue ? new Date(beforeDateValue) : null;
      if (beforeDateValue && (!before || Number.isNaN(before.getTime()))) {
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
      if (before) {
        const cursorCondition = beforeId
          ? or(
              lt(conversations.updatedAt, before),
              and(
                eq(conversations.updatedAt, before),
                lt(conversations.id, beforeId),
              ),
            )
          : lt(conversations.updatedAt, before);
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
      let list;
      let hasMore;
      if (q) {
        const candidateConversations = await db
          .select(conversationSelection)
          .from(conversations)
          .where(and(...conditions))
          .orderBy(desc(conversations.updatedAt), desc(conversations.id));
        const encryptedParts = await db
          .select({
            conversationId: messages.conversationId,
            contentEncrypted: messageParts.contentEncrypted,
          })
          .from(messageParts)
          .innerJoin(messages, eq(messages.id, messageParts.messageId))
          .innerJoin(
            conversations,
            eq(conversations.id, messages.conversationId),
          )
          .where(
            and(
              ...conditions,
              eq(messageParts.type, "text"),
              isNotNull(messageParts.contentEncrypted),
            ),
          )
          .orderBy(
            desc(conversations.updatedAt),
            desc(conversations.id),
            asc(messages.createdAt),
            asc(messageParts.sortOrder),
          );
        const partsByConversation = new Map<string, string[]>();
        for (const part of encryptedParts) {
          if (!part.contentEncrypted) continue;
          const existing = partsByConversation.get(part.conversationId);
          if (existing) existing.push(part.contentEncrypted);
          else
            partsByConversation.set(part.conversationId, [
              part.contentEncrypted,
            ]);
        }
        const matches = [];
        for (const conversation of candidateConversations) {
          if (conversationTextMatches(conversation.title, q)) {
            matches.push({
              ...conversation,
              searchMatch: {
                kind: "title" as const,
                snippet: conversationSearchSnippet(conversation.title, q),
              },
            });
          } else {
            for (const encryptedPart of partsByConversation.get(
              conversation.id,
            ) ?? []) {
              try {
                const content = await decryptValue(encryptedPart);
                if (!conversationTextMatches(content, q)) continue;
                matches.push({
                  ...conversation,
                  searchMatch: {
                    kind: "message" as const,
                    snippet: conversationSearchSnippet(content, q),
                  },
                });
                break;
              } catch {
                // Ignore legacy parts that cannot be decrypted with the active key.
              }
            }
          }
          if (matches.length > limit) break;
        }
        hasMore = matches.length > limit;
        list = hasMore ? matches.slice(0, limit) : matches;
      } else {
        const rows = await db
          .select(conversationSelection)
          .from(conversations)
          .where(and(...conditions))
          .orderBy(
            sql`${conversations.pinnedAt} IS NULL`,
            desc(sql`${conversations.sidebarOrder} IS NULL`),
            asc(conversations.sidebarOrder),
            desc(conversations.updatedAt),
            desc(conversations.id),
          )
          .limit(limit + 1);
        hasMore = rows.length > limit;
        list = hasMore ? rows.slice(0, limit) : rows;
      }
      if (includeMeta === "true") {
        const [folders, latestConversation] = await Promise.all([
          db
            .select({
              id: conversationFolders.id,
              name: conversationFolders.name,
              sortOrder: conversationFolders.sortOrder,
              createdAt: conversationFolders.createdAt,
              updatedAt: conversationFolders.updatedAt,
            })
            .from(conversationFolders)
            .where(
              and(
                eq(conversationFolders.workspaceId, workspaceId),
                eq(conversationFolders.userId, session.user.id),
                isNull(conversationFolders.archivedAt),
              ),
            )
            .orderBy(
              asc(conversationFolders.sortOrder),
              asc(conversationFolders.createdAt),
              asc(conversationFolders.id),
            ),
          db
            .select({
              id: conversations.id,
              agentId: conversations.agentId,
            })
            .from(conversations)
            .where(and(...scopeConditions))
            .orderBy(desc(conversations.updatedAt), desc(conversations.id))
            .limit(1),
        ]);
        return NextResponse.json({
          conversations: list,
          folders,
          latestConversationId: latestConversation[0]?.id ?? null,
          latestConversationAgentId: latestConversation[0]?.agentId ?? null,
          hasMore,
          nextCursor: hasMore ? createConversationCursor(list.at(-1)) : null,
        });
      }
      return NextResponse.json(list);
    },
    { logLabel: "Failed to list conversations" },
  );
}
