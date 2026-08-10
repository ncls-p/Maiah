import { handleRoute } from "@/lib/route-handler";
import {
  createChatStreamResponse,
  hasActiveChatStream,
} from "@/modules/chat/stream-bus";
import { db } from "@/server/infrastructure/db";
import { messages } from "@/server/infrastructure/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedConversation } from "../conversation-route-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const access = await getAuthorizedConversation(session.user.id, params);
      if (!access.ok) return access.response;
      const { conversationId } = access;

      const [streamingMessage] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.role, "assistant"),
            eq(messages.status, "streaming"),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);

      if (!streamingMessage) {
        return NextResponse.json(
          { error: "No active stream" },
          { status: 404 },
        );
      }

      if (!hasActiveChatStream(streamingMessage.id)) {
        return NextResponse.json(
          { error: "Stream is no longer active" },
          { status: 409 },
        );
      }

      return createChatStreamResponse(
        streamingMessage.id,
        { "X-Message-Id": streamingMessage.id },
        { replay: true },
      );
    },
    { logLabel: "Failed to resume conversation stream" },
  );
}
