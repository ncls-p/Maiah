import { handleRoute } from "@/lib/route-handler";
import { forkConversationAtMessage } from "@/modules/chat/conversation-branches";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAuthorizedConversation } from "../conversation-route-access";

const requestSchema = z.object({ messageId: z.uuid() });

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
      if (!access.access.canContinue) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const parsed = requestSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      try {
        const fork = await forkConversationAtMessage({
          source: access.conversation,
          messageId: parsed.data.messageId,
          userId: session.user.id,
        });
        return NextResponse.json({
          conversation: {
            id: fork.id,
            agentId: fork.agentId,
            title: fork.title,
            updatedAt: fork.updatedAt,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to fork conversation";
        return NextResponse.json({ error: message }, { status: 409 });
      }
    },
    { logLabel: "Failed to fork conversation" },
  );
}
