const UNREAD_PREFIX = "maiah-chat-conversation-unread";
const STREAMING_PREFIX = "maiah-chat-conversation-streaming";

function readIdSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const value = JSON.parse(
      window.localStorage.getItem(key) ?? "[]",
    ) as unknown;
    if (!Array.isArray(value)) return new Set();
    return new Set(
      value.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    );
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    if (ids.size === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Keep the in-memory set when storage is unavailable.
  }
}

export function readUnreadConversationIds(workspaceId: string): Set<string> {
  return readIdSet(`${UNREAD_PREFIX}:${workspaceId}`);
}

export function writeUnreadConversationIds(
  workspaceId: string,
  unreadIds: Set<string>,
) {
  writeIdSet(`${UNREAD_PREFIX}:${workspaceId}`, unreadIds);
}

export function readStreamingConversationIds(workspaceId: string): Set<string> {
  return readIdSet(`${STREAMING_PREFIX}:${workspaceId}`);
}

export function writeStreamingConversationIds(
  workspaceId: string,
  streamingIds: Set<string>,
) {
  writeIdSet(`${STREAMING_PREFIX}:${workspaceId}`, streamingIds);
}

export function updateUnreadConversationIds(
  current: Set<string>,
  conversationId: string,
  unread: boolean,
): Set<string> {
  if (unread === current.has(conversationId)) return current;
  const next = new Set(current);
  if (unread) next.add(conversationId);
  else next.delete(conversationId);
  return next;
}

export function reduceConversationLiveStatus(
  trackedStreamingId: string | null,
  conversationId: string | null,
  sending: boolean,
) {
  if (sending && conversationId) {
    const started = trackedStreamingId !== conversationId;
    return {
      trackedStreamingId: conversationId,
      startId: started ? conversationId : null,
      stopId: started && trackedStreamingId ? trackedStreamingId : null,
      markStopUnread: false,
    };
  }
  if (!sending && trackedStreamingId && conversationId === trackedStreamingId) {
    return {
      trackedStreamingId: null,
      startId: null,
      stopId: trackedStreamingId,
      markStopUnread: true,
    };
  }
  return {
    trackedStreamingId,
    startId: null,
    stopId: null,
    markStopUnread: false,
  };
}
