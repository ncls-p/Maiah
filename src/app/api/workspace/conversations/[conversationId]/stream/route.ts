import { handleRoute } from "@/lib/route-handler";
import {
  createChatStreamResponse,
  hasActiveChatStream,
} from "@/modules/chat/stream-bus";
import { reapExpiredChatStreams } from "@/modules/chat/chat-stream-lease";
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
      const access = await getAuthorizedConversation(
        session.user.id,
        params,
        "conversations.viewOwn",
      );
      if (!access.ok) return access.response;
      const { conversationId } = access;

      const [streamingMessage] = await db
        .select({
          id: messages.id,
          generationId: messages.streamGenerationId,
        })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.role, "assistant"),
            eq(messages.status, "streaming"),
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(1);

      if (!streamingMessage) {
        return NextResponse.json(
          { error: "No active stream" },
          { status: 404 },
        );
      }
      if (!streamingMessage.generationId) {
        const expired = await reapExpiredChatStreams(new Date(), [
          streamingMessage.id,
        ]);
        if (expired.length === 0) {
          return NextResponse.json(
            {
              active: true,
              legacy: true,
              retryAfterMs: 2_000,
              messageId: streamingMessage.id,
            },
            { status: 202 },
          );
        }
        return NextResponse.json(
          { error: "Stream is no longer active", reconciled: true },
          { status: 409 },
        );
      }

      if (
        !hasActiveChatStream(streamingMessage.id, streamingMessage.generationId)
      ) {
        const expired = await reapExpiredChatStreams(new Date(), [
          streamingMessage.id,
        ]);
        if (expired.length > 0) {
          return NextResponse.json(
            { error: "Stream is no longer active", reconciled: true },
            { status: 409 },
          );
        }
        return NextResponse.json(
          {
            active: true,
            retryAfterMs: 2_000,
            messageId: streamingMessage.id,
          },
          { status: 202 },
        );
      }

      return createChatStreamResponse(
        streamingMessage.id,
        { "X-Message-Id": streamingMessage.id },
        { replay: true, generationId: streamingMessage.generationId },
      );
    },
    { logLabel: "Failed to resume conversation stream" },
  );
}
