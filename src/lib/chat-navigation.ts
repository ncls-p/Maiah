export type ChatHrefOptions = {
  agentId?: string | null;
  conversationId?: string | null;
  temporaryTtlMinutes?: number | null;
  pathname?: string;
};

export function createChatHref({
  agentId,
  conversationId,
  temporaryTtlMinutes,
  pathname = "/chat",
}: ChatHrefOptions = {}) {
  const params = new URLSearchParams();
  if (conversationId) params.set("conversationId", conversationId);
  if (agentId) params.set("agentId", agentId);
  if (temporaryTtlMinutes !== null && temporaryTtlMinutes !== undefined) {
    params.set("temporary", "true");
    params.set("ttl", String(temporaryTtlMinutes));
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
