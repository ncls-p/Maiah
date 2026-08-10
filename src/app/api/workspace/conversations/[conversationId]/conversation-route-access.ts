import { isWorkspaceMemberForRequest } from "@/modules/auth/workspace-access";
import { getConversationAccess } from "@/modules/chat/conversation-sharing";
import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ conversationId: z.uuid() });

export async function getAuthorizedConversation(
  userId: string,
  params: Promise<{ conversationId: string }>,
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid request" },
        { status: 400 },
      ),
    } as const;

  const { conversationId } = parsed.data;
  const access = await getConversationAccess(conversationId, userId);
  if (!access)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      ),
    } as const;
  if (
    !(await isWorkspaceMemberForRequest(
      userId,
      access.conversation.workspaceId,
    ))
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return {
    ok: true,
    conversation: access.conversation,
    conversationId,
    access,
  } as const;
}
