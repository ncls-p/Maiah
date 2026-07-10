import type { ChatMessage } from "@/components/chat/chat-types";

export function shouldUseMessageScrollAnchor(input: {
  message: ChatMessage;
  sending: boolean;
}) {
  void input;
  return false;
}
