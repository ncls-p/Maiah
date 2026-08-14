"use client";

import { useEffect } from "react";

import {
  notifyConversationRead,
  notifyConversationStreaming,
} from "@/lib/workspace-history-events";

export function useConversationHistoryLiveStatus(
  conversationId: string | null,
  sending: boolean,
) {
  useEffect(() => {
    if (!conversationId) return;
    notifyConversationRead(conversationId);
    if (!sending) return;
    notifyConversationStreaming(conversationId, true);
    return () => notifyConversationStreaming(conversationId, false);
  }, [conversationId, sending]);
}
