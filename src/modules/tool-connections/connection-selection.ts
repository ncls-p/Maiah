export type ExecutionConnection = {
  id: string;
  label: string;
  instanceUrl: string | null;
};

/** Public target metadata must never contain credentials, query tokens or fragments. */
export function safeInstanceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

export function selectExecutionConnections<T extends ExecutionConnection>(
  available: T[],
  allowedIds: string[],
  conversationIds?: string[],
): T[] {
  return available.filter(
    (connection) =>
      allowedIds.includes(connection.id) &&
      (conversationIds === undefined ||
        conversationIds.includes(connection.id)),
  );
}
