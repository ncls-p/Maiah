const STORAGE_PREFIX = "maiah-chat-conversation-unread";

function storageKey(workspaceId: string) {
  return `${STORAGE_PREFIX}:${workspaceId}`;
}

export function readUnreadConversationIds(workspaceId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const value = JSON.parse(
      window.localStorage.getItem(storageKey(workspaceId)) ?? "[]",
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

export function writeUnreadConversationIds(
  workspaceId: string,
  unreadIds: Set<string>,
) {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(workspaceId);
    if (unreadIds.size === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify([...unreadIds]));
  } catch {
    // Keep the in-memory unread set when storage is unavailable.
  }
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
