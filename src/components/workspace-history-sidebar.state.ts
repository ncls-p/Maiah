import type { ChatConversation } from "@/components/chat/chat-types";

export type WorkspaceHistoryRefreshCycle = {
  promise: Promise<void>;
  resolve: () => void;
  dirty: boolean;
};

export function queueWorkspaceHistoryRefresh(
  current: WorkspaceHistoryRefreshCycle | null,
) {
  if (current) {
    current.dirty = true;
    return { cycle: current, shouldFetch: false } as const;
  }

  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    cycle: { promise, resolve, dirty: false },
    shouldFetch: true,
  } as const;
}

export function settleWorkspaceHistoryRefresh(
  cycle: WorkspaceHistoryRefreshCycle,
) {
  if (cycle.dirty) {
    cycle.dirty = false;
    return "refetch" as const;
  }
  cycle.resolve();
  return "complete" as const;
}

export function resolveWorkspaceHistorySearchState<T>({
  query,
  workspaceId,
  resultWorkspaceId,
  results,
  inFlight,
  failed,
}: {
  query: string;
  workspaceId: string | null;
  resultWorkspaceId: string | null;
  results: T[];
  inFlight: boolean;
  failed: boolean;
}) {
  const active = query.trim().length > 0;
  const resolvedForWorkspace =
    workspaceId !== null && resultWorkspaceId === workspaceId;
  return {
    results: active && resolvedForWorkspace ? results : [],
    searching: active && (inFlight || !resolvedForWorkspace),
    error: active && resolvedForWorkspace && failed,
  };
}

export type WorkspaceHistoryLiveOverride = {
  value: boolean;
  serverRevision: number;
};

export type WorkspaceHistoryOptimisticLiveState = {
  workspaceId: string | null;
  streaming: ReadonlyMap<string, WorkspaceHistoryLiveOverride>;
  unread: ReadonlyMap<string, WorkspaceHistoryLiveOverride>;
};

export function resolveWorkspaceHistoryLiveIds(
  conversations: ChatConversation[],
  optimistic: WorkspaceHistoryOptimisticLiveState,
  workspaceId: string | null,
  serverRevision: number,
) {
  const streamingIds = new Set<string>();
  const unreadIds = new Set<string>();
  for (const conversation of conversations) {
    if (conversation.isStreaming) streamingIds.add(conversation.id);
    if (conversation.isUnread && !conversation.isStreaming) {
      unreadIds.add(conversation.id);
    }
  }

  if (optimistic.workspaceId !== workspaceId) {
    return { streamingIds, unreadIds };
  }
  for (const [conversationId, override] of optimistic.streaming) {
    if (override.serverRevision !== serverRevision) continue;
    if (override.value) streamingIds.add(conversationId);
    else streamingIds.delete(conversationId);
  }
  for (const [conversationId, override] of optimistic.unread) {
    if (override.serverRevision !== serverRevision) continue;
    if (override.value) unreadIds.add(conversationId);
    else unreadIds.delete(conversationId);
  }
  for (const conversationId of streamingIds) unreadIds.delete(conversationId);
  return { streamingIds, unreadIds };
}
