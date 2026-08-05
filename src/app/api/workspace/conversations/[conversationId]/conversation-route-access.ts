import { requireResourcePermissionAsync } from "@/lib/route-handler";
import { db } from "@/server/infrastructure/db";
import { conversations } from "@/server/infrastructure/db/schema";
import { and,eq,isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ conversationId: z.uuid() });

export async function getAuthorizedConversation(userId: string, params: Promise<{ conversationId: string }>) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return { ok: false, response: NextResponse.json({ error: "Invalid request" }, { status: 400 }) } as const;

  const { conversationId } = parsed.data;
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.status, "active"), isNull(conversations.archivedAt)))
    .limit(1);
  if (!conversation) return { ok: false, response: NextResponse.json({ error: "Conversation not found" }, { status: 404 }) } as const;

  const forbidden = await requireResourcePermissionAsync(userId, conversation.workspaceId, "conversations.viewOwn", "conversation", conversationId);
  if (forbidden) return { ok: false, response: forbidden } as const;
  return { ok: true, conversation, conversationId } as const;
}
