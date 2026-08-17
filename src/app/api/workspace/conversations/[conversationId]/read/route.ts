import { handleRoute } from "@/lib/route-handler";
import { markConversationRead } from "@/modules/chat/conversation-read-state";
import { resolveResponseVersionRootId } from "@/modules/chat/response-version-lineage";
import { db } from "@/server/infrastructure/db";
import { messages } from "@/server/infrastructure/db/schema";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAuthorizedConversation } from "../conversation-route-access";

const readRequestSchema = z.object({ throughMessageId: z.uuid().optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const access = await getAuthorizedConversation(
        session.user.id,
        params,
        "conversations.viewOwn",
      );
      if (!access.ok) return access.response;

      const parsed = readRequestSchema.safeParse(
        await req.json().catch(() => ({})),
      );
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const conditions = [
        eq(messages.conversationId, access.conversationId),
        eq(messages.role, "assistant"),
        inArray(messages.status, ["completed", "failed", "cancelled"]),
        isNotNull(messages.completedAt),
      ];
      if (parsed.data.throughMessageId) {
        conditions.push(eq(messages.id, parsed.data.throughMessageId));
      }
      const [throughMessage] = await db
        .select({ id: messages.id, completedAt: messages.completedAt })
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(1);
      if (parsed.data.throughMessageId && !throughMessage) {
        return NextResponse.json(
          { error: "Assistant message not found" },
          { status: 404 },
        );
      }

      const historyConversationId = await resolveResponseVersionRootId(
        access.conversation,
      );
      if (throughMessage?.completedAt) {
        await markConversationRead(
          historyConversationId,
          session.user.id,
          throughMessage.completedAt,
        );
      }
      return NextResponse.json({
        ok: true,
        historyConversationId,
        throughMessageId: throughMessage?.id ?? null,
      });
    },
    { logLabel: "Failed to mark conversation as read" },
  );
}
