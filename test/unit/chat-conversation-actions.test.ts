import { afterEach, describe, expect, it, vi } from "vitest";

import { useConversationActions } from "@/app/[locale]/(workspace)/chat/page.use-conversation-actions";

type ActionContext = Parameters<typeof useConversationActions>[0];

function setupWindow(pathname = "/fr/chat") {
	const replaceState = vi.fn();
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { history: { replaceState }, location: { pathname } },
	});
	return replaceState;
}

function createContext(
	overrides: Partial<ActionContext> = {},
): ActionContext & { newConversationAgentIdRef: { current: string | null } } {
	return {
		selectedAgentId: "agent-default",
		activeConversationId: null,
		conversations: [],
		newConversationAgentIdRef: { current: "agent-default" },
		setSelectedAgentId: vi.fn(),
		setActiveConversationId: vi.fn(),
		setActiveVersion: vi.fn(),
		setQueuedMessages: vi.fn(),
		setMessages: vi.fn(),
		setCodeWorkspaceArtifact: vi.fn(),
		setAttachments: vi.fn(),
		detachActiveStream: vi.fn(),
		restoreComposerDraft: vi.fn(),
		resetInterfaceMode: vi.fn(),
		...overrides,
	};
}

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
});

describe("chat assistant selection", () => {
	it("selects another assistant in a new empty conversation", () => {
		const replaceState = setupWindow();
		const context = createContext();

		useConversationActions(context).selectAgent("agent-code");

		expect(context.newConversationAgentIdRef.current).toBe("agent-code");
		expect(context.setSelectedAgentId).toHaveBeenCalledWith("agent-code");
		expect(context.restoreComposerDraft).toHaveBeenCalledWith(
			"agent-code",
			null,
		);
		expect(replaceState).toHaveBeenCalledWith(
			null,
			"",
			"/fr/chat?agentId=agent-code",
		);
	});

	it("keeps the current conversation while previewing another assistant", () => {
		const replaceState = setupWindow();
		const context = createContext({
			selectedAgentId: "agent-fast",
			activeConversationId: "conversation-1",
			newConversationAgentIdRef: { current: "agent-fast" },
		});

		useConversationActions(context).selectAgent("agent-code");

		expect(context.newConversationAgentIdRef.current).toBe("agent-code");
		expect(context.restoreComposerDraft).not.toHaveBeenCalled();
		expect(replaceState).toHaveBeenCalledWith(
			null,
			"",
			"/fr/chat?conversationId=conversation-1&agentId=agent-code",
		);
	});

	it("uses the newly selected assistant when starting from an existing conversation", () => {
		const replaceState = setupWindow();
		const context = createContext({
			selectedAgentId: "agent-fast",
			activeConversationId: "conversation-1",
			newConversationAgentIdRef: { current: "agent-fast" },
		});
		const actions = useConversationActions(context);

		actions.selectAgent("agent-code");
		actions.startNewConversation();

		expect(context.newConversationAgentIdRef.current).toBe("agent-code");
		expect(replaceState).toHaveBeenLastCalledWith(
			null,
			"",
			"/fr/chat?agentId=agent-code",
		);
		expect(context.setSelectedAgentId).toHaveBeenLastCalledWith("agent-code");
	});

	it("selects the assistant attached to a conversation", () => {
		const replaceState = setupWindow();
		const context = createContext({
			conversations: [
				{
					id: "conversation-2",
					title: "Code conversation",
					agentId: "agent-code",
					updatedAt: new Date().toISOString(),
				},
			],
		});

		useConversationActions(context).selectConversation("conversation-2");

		expect(context.newConversationAgentIdRef.current).toBe("agent-code");
		expect(context.setSelectedAgentId).toHaveBeenCalledWith("agent-code");
		expect(context.restoreComposerDraft).toHaveBeenCalledWith(
			"agent-code",
			"conversation-2",
		);
		expect(replaceState).toHaveBeenCalledWith(
			null,
			"",
			"/fr/chat?conversationId=conversation-2&agentId=agent-code",
		);
	});

	it("uses route attribution while the conversation directory is still loading", () => {
		const replaceState = setupWindow();
		const context = createContext();

		useConversationActions(context).selectConversation(
			"conversation-2",
			"agent-route",
		);

		expect(context.newConversationAgentIdRef.current).toBe("agent-route");
		expect(context.setSelectedAgentId).toHaveBeenCalledWith("agent-route");
		expect(replaceState).toHaveBeenCalledWith(
			null,
			"",
			"/fr/chat?conversationId=conversation-2&agentId=agent-route",
		);
	});
});
