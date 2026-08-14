"use client";

import { useEffect, useRef } from "react";

import {
  notifyConversationRead,
  notifyConversationStreaming,
} from "@/lib/workspace-history-events";
import { reduceConversationLiveStatus } from "@/lib/workspace-history-unread";

export function useConversationHistoryLiveStatus(
  conversationId: string | null,
  sending: boolean,
) {
  const trackedStreamingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId) notifyConversationRead(conversationId);
  }, [conversationId]);

  useEffect(() => {
    const next = reduceConversationLiveStatus(
      trackedStreamingIdRef.current,
      conversationId,
      sending,
    );
    if (next.stopId) {
      notifyConversationStreaming(next.stopId, false, {
        markUnread: next.markStopUnread,
      });
    }
    if (next.startId) notifyConversationStreaming(next.startId, true);
    trackedStreamingIdRef.current = next.trackedStreamingId;
  }, [conversationId, sending]);
}
