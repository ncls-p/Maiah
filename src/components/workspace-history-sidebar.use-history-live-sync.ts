"use client";

import { useEffect, useRef, useState } from "react";

import { useWorkspace } from "@/hooks/use-workspace";
import { subscribeWorkspaceHistoryLive } from "@/lib/workspace-history-events";
import {
  readUnreadConversationIds,
  updateUnreadConversationIds,
  writeUnreadConversationIds,
} from "@/lib/workspace-history-unread";

function activeConversationIdFromLocation() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("conversationId");
}

export function useWorkspaceHistoryLiveSync(onRefresh: () => void) {
  const { workspaceId } = useWorkspace();
  const onRefreshRef = useRef(onRefresh);
  const workspaceIdRef = useRef(workspaceId);
  const [streamingIds, setStreamingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(
    null,
  );
  if (workspaceId && workspaceId !== loadedWorkspaceId) {
    setLoadedWorkspaceId(workspaceId);
    setUnreadIds(readUnreadConversationIds(workspaceId));
  }

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);
  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    function applyUnread(conversationId: string, unread: boolean) {
      const currentWorkspaceId = workspaceIdRef.current;
      setUnreadIds((current) => {
        const next = updateUnreadConversationIds(
          current,
          conversationId,
          unread,
        );
        if (next !== current && currentWorkspaceId) {
          writeUnreadConversationIds(currentWorkspaceId, next);
        }
        return next;
      });
    }

    return subscribeWorkspaceHistoryLive({
      onRefresh: () => {
        const activeId = activeConversationIdFromLocation();
        if (activeId) applyUnread(activeId, false);
        onRefreshRef.current();
      },
      onStreaming: (conversationId, streaming) => {
        setStreamingIds((current) => {
          if (streaming === current.has(conversationId)) return current;
          const next = new Set(current);
          if (streaming) next.add(conversationId);
          else next.delete(conversationId);
          return next;
        });
        if (
          !streaming &&
          conversationId !== activeConversationIdFromLocation()
        ) {
          applyUnread(conversationId, true);
        }
      },
      onUnread: applyUnread,
    });
  }, []);

  return { streamingIds, unreadIds };
}
