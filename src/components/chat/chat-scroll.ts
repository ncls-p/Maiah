import type { ChatMessage } from "@/components/chat/chat-types";

export function shouldUseMessageScrollAnchor({
	message,
	sending,
}: {
	message: ChatMessage;
	sending: boolean;
}) {
	return message.role === "user" && !sending;
}
