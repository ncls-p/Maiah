"use client";

import { useCallback, useEffect, useRef } from "react";

import { notifyConversationRead } from "@/lib/workspace-history-events";

export function useConversationHistoryLiveStatus(input: {
  workspaceId: string | null | undefined;
  conversationId: string | null;
  throughMessageId: string | null;
  ready: boolean;
  sending: boolean;
}) {
  const { workspaceId, conversationId, throughMessageId, ready, sending } =
    input;
  const acknowledgedKeyRef = useRef<string | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);
  const markRead = useCallback(() => {
    if (
      !workspaceId ||
      !conversationId ||
      !throughMessageId ||
      !ready ||
      document.hidden
    ) {
      return;
    }
    const key = `${workspaceId}:${conversationId}:${throughMessageId}`;
    if (acknowledgedKeyRef.current === key || inFlightKeyRef.current === key) {
      return;
    }
    inFlightKeyRef.current = key;
    void fetch(`/api/workspace/conversations/${conversationId}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ throughMessageId }),
    })
      .then(async (response) => {
        if (response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            historyConversationId?: string;
          } | null;
          acknowledgedKeyRef.current = key;
          notifyConversationRead(
            workspaceId,
            payload?.historyConversationId ?? conversationId,
          );
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (inFlightKeyRef.current === key) inFlightKeyRef.current = null;
      });
  }, [conversationId, ready, throughMessageId, workspaceId]);

  useEffect(() => {
    if (!sending) markRead();
  }, [markRead, sending]);

  useEffect(() => {
    function markReadWhenVisible() {
      if (!document.hidden && !sending) markRead();
    }
    window.addEventListener("focus", markReadWhenVisible);
    window.addEventListener("pageshow", markReadWhenVisible);
    document.addEventListener("visibilitychange", markReadWhenVisible);
    return () => {
      window.removeEventListener("focus", markReadWhenVisible);
      window.removeEventListener("pageshow", markReadWhenVisible);
      document.removeEventListener("visibilitychange", markReadWhenVisible);
    };
  }, [markRead, sending]);
}
