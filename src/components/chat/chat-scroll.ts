import type { ChatMessage } from "@/components/chat/chat-types";

const CHAT_SCROLL_END_THRESHOLD = 32;

export function isChatViewportAtEnd(
  viewport: Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">,
  threshold = CHAT_SCROLL_END_THRESHOLD,
) {
  return (
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
    threshold
  );
}

/** Pin before paint. A rAF-delayed scroll lets one frame render off-end,
 *  which reads as a tremble while following a stream. */
export function pinChatViewportToEnd(
  viewport: Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">,
) {
  const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  if (Math.abs(viewport.scrollTop - top) < 0.5) return;
  viewport.scrollTop = top;
}

export function getChatStreamFollowKey(messages: ChatMessage[]) {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return "empty";

  const partSignature = lastMessage.parts
    .map((part) => `${part.type}:${part.state ?? ""}:${part.content.length}`)
    .join("|");

  return [
    messages.length,
    lastMessage.id,
    lastMessage.status ?? "",
    partSignature,
  ].join(":");
}

export function cancelsChatStreamFollow(input: {
  key: string;
  shiftKey?: boolean;
}) {
  return (
    input.key === "ArrowUp" ||
    input.key === "PageUp" ||
    input.key === "Home" ||
    (input.key === " " && input.shiftKey === true)
  );
}

export function shouldUseMessageScrollAnchor(input: {
  message: ChatMessage;
  sending: boolean;
}) {
  void input;
  return false;
}
