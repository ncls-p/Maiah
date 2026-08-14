"use client";

import { useEffect, useRef, useState } from "react";

import { useWorkspace } from "@/hooks/use-workspace";
import { subscribeWorkspaceHistoryLive } from "@/lib/workspace-history-events";
import {
  readStreamingConversationIds,
  readUnreadConversationIds,
  updateUnreadConversationIds,
  writeStreamingConversationIds,
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
  const streamingIdsRef = useRef<Set<string>>(new Set());
  const unreadIdsRef = useRef<Set<string>>(new Set());
  const [streamingIds, setStreamingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(
    null,
  );
  if (workspaceId && workspaceId !== loadedWorkspaceId) {
    setLoadedWorkspaceId(workspaceId);
    setStreamingIds(readStreamingConversationIds(workspaceId));
    setUnreadIds(readUnreadConversationIds(workspaceId));
  }

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);
  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);
  useEffect(() => {
    streamingIdsRef.current = streamingIds;
  }, [streamingIds]);
  useEffect(() => {
    unreadIdsRef.current = unreadIds;
  }, [unreadIds]);

  useEffect(() => {
    function applyUnread(conversationId: string, unread: boolean) {
      const currentWorkspaceId = workspaceIdRef.current;
      const next = updateUnreadConversationIds(
        unreadIdsRef.current,
        conversationId,
        unread,
      );
      if (next === unreadIdsRef.current) return;
      unreadIdsRef.current = next;
      if (currentWorkspaceId) {
        writeUnreadConversationIds(currentWorkspaceId, next);
      }
      setUnreadIds(next);
    }

    function applyStreaming(conversationId: string, streaming: boolean) {
      const currentWorkspaceId = workspaceIdRef.current;
      const next = updateUnreadConversationIds(
        streamingIdsRef.current,
        conversationId,
        streaming,
      );
      if (next === streamingIdsRef.current) return;
      streamingIdsRef.current = next;
      if (currentWorkspaceId) {
        writeStreamingConversationIds(currentWorkspaceId, next);
      }
      setStreamingIds(next);
    }

    function hydrateFromStorage() {
      const currentWorkspaceId = workspaceIdRef.current;
      if (!currentWorkspaceId) return;
      const activeId = activeConversationIdFromLocation();
      const nextUnread = readUnreadConversationIds(currentWorkspaceId);
      if (activeId) nextUnread.delete(activeId);
      const nextStreaming = readStreamingConversationIds(currentWorkspaceId);
      streamingIdsRef.current = nextStreaming;
      unreadIdsRef.current = nextUnread;
      setStreamingIds(nextStreaming);
      setUnreadIds(nextUnread);
    }

    return subscribeWorkspaceHistoryLive({
      onRefresh: () => {
        hydrateFromStorage();
        onRefreshRef.current();
      },
      onStreaming: (conversationId, streaming, markUnread) => {
        applyStreaming(conversationId, streaming);
        if (streaming) {
          applyUnread(conversationId, false);
          return;
        }
        if (
          markUnread &&
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
