import type { ChatMessage } from "@/components/chat/chat-types";

export function shouldUseMessageScrollAnchor(message: ChatMessage) {
  return message.role === "user";
}
