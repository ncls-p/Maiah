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
