import { getConversationMessages } from "@/modules/agent/use-cases";
import { db } from "@/server/infrastructure/db";
import { agents, conversations } from "@/server/infrastructure/db/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publicShareId: string }> },
) {
  const parsed = z.object({ publicShareId: z.uuid() }).safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [conversation] = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
      agentName: agents.name,
      agentLogoUrl: agents.logoUrl,
    })
    .from(conversations)
    .innerJoin(agents, eq(agents.id, conversations.agentId))
    .where(
      and(
        eq(conversations.publicShareId, parsed.data.publicShareId),
        isNotNull(conversations.publicSharedAt),
        eq(conversations.status, "active"),
        eq(conversations.isEphemeral, false),
        isNull(conversations.archivedAt),
      ),
    )
    .limit(1);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const messages = (await getConversationMessages(conversation.id))
    .filter(
      (message) => message.role === "user" || message.role === "assistant",
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      createdAt: new Date(message.createdAt).toISOString(),
      parts: message.parts.filter((part) => part.type === "text"),
    }));
  return NextResponse.json({
    conversation,
    messages,
  });
}
