"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ChatConversation } from "@/components/chat/chat-types";
import { useWorkspace } from "@/hooks/use-workspace";
import { subscribeWorkspaceHistoryLive } from "@/lib/workspace-history-events";
import {
  resolveWorkspaceHistoryLiveIds,
  type WorkspaceHistoryLiveOverride,
  type WorkspaceHistoryOptimisticLiveState,
} from "./workspace-history-sidebar.state";

const ACTIVE_STREAM_REFRESH_MS = 10_000;
const IDLE_REFRESH_MS = 15_000;
const REFRESH_DEBOUNCE_MS = 250;

function activeConversationIdFromLocation() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("conversationId");
}

export function useWorkspaceHistoryLiveSync(
  conversations: ChatConversation[],
  serverRevision: number,
  onRefresh: () => Promise<void> | void,
) {
  const { workspaceId } = useWorkspace();
  const onRefreshRef = useRef(onRefresh);
  const [optimistic, setOptimistic] =
    useState<WorkspaceHistoryOptimisticLiveState>(() => ({
      workspaceId: null,
      streaming: new Map(),
      unread: new Map(),
    }));

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const { streamingIds, unreadIds } = useMemo(() => {
    return resolveWorkspaceHistoryLiveIds(
      conversations,
      optimistic,
      workspaceId,
      serverRevision,
    );
  }, [conversations, optimistic, serverRevision, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let refreshTimeoutId: number | null = null;

    const requestRefresh = () => {
      if (refreshTimeoutId !== null) window.clearTimeout(refreshTimeoutId);
      refreshTimeoutId = window.setTimeout(() => {
        refreshTimeoutId = null;
        void onRefreshRef.current();
      }, REFRESH_DEBOUNCE_MS);
    };

    function applyOverride(
      kind: "streaming" | "unread",
      conversationId: string,
      value: boolean,
    ) {
      setOptimistic((current) => {
        const base =
          current.workspaceId === workspaceId
            ? current
            : {
                workspaceId,
                streaming: new Map<string, WorkspaceHistoryLiveOverride>(),
                unread: new Map<string, WorkspaceHistoryLiveOverride>(),
              };
        const currentOverride = base[kind].get(conversationId);
        if (
          currentOverride?.value === value &&
          currentOverride.serverRevision === serverRevision
        ) {
          return base;
        }
        const nextOverrides = new Map(base[kind]);
        nextOverrides.set(conversationId, { value, serverRevision });
        return { ...base, [kind]: nextOverrides };
      });
    }

    const unsubscribe = subscribeWorkspaceHistoryLive(workspaceId, {
      onRefresh: requestRefresh,
      onStreaming: (conversationId, streaming, markUnread) => {
        applyOverride("streaming", conversationId, streaming);
        if (streaming) {
          applyOverride("unread", conversationId, false);
          return;
        }
        if (
          markUnread &&
          conversationId !== activeConversationIdFromLocation()
        ) {
          applyOverride("unread", conversationId, true);
        } else if (markUnread) {
          applyOverride("unread", conversationId, false);
        }
      },
      onUnread: (conversationId, unread) =>
        applyOverride("unread", conversationId, unread),
    });
    return () => {
      unsubscribe();
      if (refreshTimeoutId !== null) window.clearTimeout(refreshTimeoutId);
    };
  }, [serverRevision, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const refreshMs =
      streamingIds.size > 0 ? ACTIVE_STREAM_REFRESH_MS : IDLE_REFRESH_MS;
    let cancelled = false;
    let timeoutId: number | null = null;
    const schedule = () => {
      if (cancelled) return;
      timeoutId = window.setTimeout(async () => {
        try {
          if (!document.hidden && navigator.onLine) {
            await onRefreshRef.current();
          }
        } finally {
          schedule();
        }
      }, refreshMs);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [streamingIds.size, workspaceId]);

  return {
    streamingIds,
    unreadIds,
    forConversations: (items: ChatConversation[]) =>
      resolveWorkspaceHistoryLiveIds(
        items,
        optimistic,
        workspaceId,
        serverRevision,
      ),
  };
}
