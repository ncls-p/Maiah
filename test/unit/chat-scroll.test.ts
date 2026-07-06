import { describe, expect, it } from "vitest";

import { shouldUseMessageScrollAnchor } from "@/components/chat/chat-scroll";
import type { ChatMessage } from "@/components/chat/chat-types";

function message(role: ChatMessage["role"]): ChatMessage {
	return { id: `${role}-1`, role, parts: [] };
}

describe("shouldUseMessageScrollAnchor", () => {
	it("does not create user scroll anchors while a response is streaming", () => {
		expect(
			shouldUseMessageScrollAnchor({
				message: message("user"),
				sending: true,
			}),
		).toBe(false);
	});

	it("keeps user messages anchorable when the chat is idle", () => {
		expect(
			shouldUseMessageScrollAnchor({
				message: message("user"),
				sending: false,
			}),
		).toBe(true);
	});

	it("never anchors assistant messages", () => {
		expect(
			shouldUseMessageScrollAnchor({
				message: message("assistant"),
				sending: false,
			}),
		).toBe(false);
	});
});
