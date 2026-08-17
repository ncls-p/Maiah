import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/components/chat/chat-types";
import {
  cancelScopedStreamingMessage,
  chatStreamOperationOwnsVisibleState,
  reloadConversationMessagesForScope,
} from "@/hooks/use-chat-stream.operation-scope";

function assistantMessage(id: string, generationId: string): ChatMessage {
  return {
    id,
    role: "assistant",
    status: "streaming",
    streamGenerationId: generationId,
    parts: [],
    createdAt: "2026-08-17T06:00:00.000Z",
  };
}

describe("chat stream operation scoping", () => {
  it("does not let a late conversation A reload overwrite conversation B", async () => {
    const controller = new AbortController();
    const messages = [assistantMessage("assistant-a", "generation-a")];
    let currentConversationId = "conversation-a";
    const commit = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ messages }));

    const reload = reloadConversationMessagesForScope({
      conversationId: "conversation-a",
      signal: controller.signal,
      currentConversationId: () => currentConversationId,
      commit,
      fetcher,
    });
    currentConversationId = "conversation-b";

    await expect(reload).resolves.toBeNull();
    expect(commit).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/workspace/conversations/conversation-a",
      { signal: controller.signal },
    );
  });

  it("commits a reload while its conversation is still current", async () => {
    const controller = new AbortController();
    const messages = [assistantMessage("assistant-a", "generation-a")];
    const commit = vi.fn();

    const result = await reloadConversationMessagesForScope({
      conversationId: "conversation-a",
      signal: controller.signal,
      currentConversationId: () => "conversation-a",
      commit,
      fetcher: vi.fn().mockResolvedValue(Response.json({ messages })),
    });

    expect(result).toEqual(messages);
    expect(commit).toHaveBeenCalledWith(messages);
  });

  it("aborts the in-flight reload with the operation signal", async () => {
    const controller = new AbortController();
    const commit = vi.fn();
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const reload = reloadConversationMessagesForScope({
      conversationId: "conversation-a",
      signal: controller.signal,
      currentConversationId: () => "conversation-a",
      commit,
      fetcher,
    });

    controller.abort();

    await expect(reload).rejects.toMatchObject({ name: "AbortError" });
    expect(commit).not.toHaveBeenCalled();
  });

  it("rejects stop cleanup after navigation or a newer request", () => {
    const stoppedController = new AbortController();
    const newerController = new AbortController();

    expect(
      chatStreamOperationOwnsVisibleState({
        currentConversationId: "conversation-b",
        targetConversationId: "conversation-a",
        currentRequestController: null,
        targetRequestController: stoppedController,
      }),
    ).toBe(false);
    expect(
      chatStreamOperationOwnsVisibleState({
        currentConversationId: "conversation-a",
        targetConversationId: "conversation-a",
        currentRequestController: newerController,
        targetRequestController: stoppedController,
      }),
    ).toBe(false);
    expect(
      chatStreamOperationOwnsVisibleState({
        currentConversationId: "conversation-a",
        targetConversationId: "conversation-a",
        currentRequestController: null,
        targetRequestController: stoppedController,
      }),
    ).toBe(true);
  });

  it("cancels only the stopped generation", () => {
    const oldMessage = assistantMessage("assistant-a", "generation-a");
    const newerMessage = assistantMessage("assistant-b", "generation-b");

    const result = cancelScopedStreamingMessage([oldMessage, newerMessage], {
      messageId: oldMessage.id,
      generationId: "generation-a",
    });

    expect(result[0]?.status).toBe("cancelled");
    expect(result[1]).toEqual(newerMessage);
  });
});
