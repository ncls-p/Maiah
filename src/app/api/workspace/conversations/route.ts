import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptValue } from "@/lib/crypto";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  conversationSearchSnippet,
  conversationTextMatches,
} from "@/modules/chat/conversation-search";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  conversationFolders,
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";

const DEFAULT_CONVERSATION_LIMIT = 50;
const MAX_CONVERSATION_LIMIT = 100;

const querySchema = z.object({
  workspaceId: z.uuid().optional(),
  agentId: z.uuid().optional(),
  before: z.string().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  includeMeta: z.enum(["true", "false"]).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CONVERSATION_LIMIT)
    .default(DEFAULT_CONVERSATION_LIMIT),
});

function createConversationCursor(
  conversation: { id: string; updatedAt: Date | string } | undefined,
) {
  if (!conversation) return null;
  const updatedAt =
    conversation.updatedAt instanceof Date
      ? conversation.updatedAt.toISOString()
      : conversation.updatedAt;
  return `${updatedAt}|${conversation.id}`;
}

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

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "conversations.viewOwn",
      );
      if (forbidden) return forbidden;

      const scopeConditions = [
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.userId, session.user.id),
        eq(conversations.status, "active"),
        isNull(conversations.archivedAt),
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
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
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
