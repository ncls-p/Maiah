import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { handleRoute } from "@/lib/route-handler";
import {
  abortChatStream,
  hasActiveChatStream,
} from "@/modules/chat/stream-bus";
import { db } from "@/server/infrastructure/db";
import { messages } from "@/server/infrastructure/db/schema";
import { getAuthorizedConversation } from "../conversation-route-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const access = await getAuthorizedConversation(session.user.id, params);
      if (!access.ok) return access.response;
      if (
        access.access.role === "recipient" &&
        (!access.access.canContinue ||
          access.access.continuationMode !== "shared")
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
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
        return NextResponse.json({ stopped: false });
      }

      const stopped = hasActiveChatStream(streamingMessage.id)
        ? abortChatStream(streamingMessage.id)
        : false;

      await db
        .update(messages)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(messages.id, streamingMessage.id));

      return NextResponse.json({ stopped, messageId: streamingMessage.id });
    },
    { logLabel: "Failed to stop chat generation" },
  );
}
