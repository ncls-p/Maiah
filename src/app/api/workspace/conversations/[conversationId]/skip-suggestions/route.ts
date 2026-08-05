import { NextRequest,NextResponse } from "next/server";

import { handleRoute } from "@/lib/route-handler";
import { requestSkipNextChatSuggestions } from "@/modules/chat/suggestion-skip";
import { getAuthorizedConversation } from "../conversation-route-access";

export async function POST(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  return handleRoute(
    req,
    async ({ session }) => {
      const access = await getAuthorizedConversation(session.user.id, params);
      if (!access.ok) return access.response;
      const { conversationId } = access;
      requestSkipNextChatSuggestions(conversationId);
      return NextResponse.json({ skipped: true });
    },
    { logLabel: "Failed to skip chat suggestions" },
  );
}
