import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { handleRoute } from "@/lib/route-handler";
import { requestAgentRunCancellation } from "@/modules/agent/run-use-cases";
import { chatStopRequestSchema } from "@/modules/chat/chat-stop-request";
import { chatStreamIdempotencyKey } from "@/modules/chat/chat-stream-lease";
import { abortChatStream } from "@/modules/chat/stream-bus";
import { db } from "@/server/infrastructure/db";
import {
  agentRuns,
  conversations,
  messages,
} from "@/server/infrastructure/db/schema";
import { getAuthorizedConversation } from "../conversation-route-access";

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
      if (
        access.access.role === "recipient" &&
        (!access.access.canContinue ||
          access.access.continuationMode !== "shared")
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const { conversationId } = access;
      const body = chatStopRequestSchema.safeParse(
        await req.json().catch(() => ({})),
      );
      if (!body.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

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
            inArray(messages.status, ["pending", "streaming"]),
            body.data.messageId
              ? eq(messages.id, body.data.messageId)
              : isNull(messages.streamGenerationId),
            body.data.generationId
              ? eq(messages.streamGenerationId, body.data.generationId)
              : undefined,
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(1);

      if (!streamingMessage) {
        return NextResponse.json({ stopped: false });
      }

      const cancelledAt = new Date();
      const stopped = await db.transaction(async (tx) => {
        const [cancelled] = await tx
          .update(messages)
          .set({
            status: "cancelled",
            completedAt: cancelledAt,
            streamLeaseExpiresAt: null,
          })
          .where(
            and(
              eq(messages.id, streamingMessage.id),
              inArray(messages.status, ["pending", "streaming"]),
              streamingMessage.generationId
                ? eq(messages.streamGenerationId, streamingMessage.generationId)
                : isNull(messages.streamGenerationId),
            ),
          )
          .returning({ id: messages.id });
        if (!cancelled) return false;
        await tx
          .update(conversations)
          .set({ updatedAt: cancelledAt })
          .where(eq(conversations.id, conversationId));
        return true;
      });
      if (!stopped) return NextResponse.json({ stopped: false });

      const localAborted = streamingMessage.generationId
        ? abortChatStream(streamingMessage.id, streamingMessage.generationId)
        : false;
      const activeRuns = await db
        .select({ id: agentRuns.id })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.messageId, streamingMessage.id),
            inArray(agentRuns.status, [
              "queued",
              "running",
              "waiting_approval",
            ]),
            streamingMessage.generationId
              ? eq(
                  agentRuns.idempotencyKey,
                  chatStreamIdempotencyKey(
                    streamingMessage.id,
                    streamingMessage.generationId,
                  ),
                )
              : lte(agentRuns.createdAt, cancelledAt),
          ),
        );
      await Promise.all(
        activeRuns.map(({ id }) =>
          requestAgentRunCancellation(id, cancelledAt),
        ),
      );

      return NextResponse.json({
        stopped: true,
        localAborted,
        messageId: streamingMessage.id,
      });
    },
    { logLabel: "Failed to stop chat generation" },
  );
}
