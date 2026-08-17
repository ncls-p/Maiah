import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeChatStream,
  registerChatStreamAbortController,
  subscribeToChatStream,
} from "@/modules/chat/stream-bus";

describe("chat stream generation edges", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes a subscriber immediately when its generation is stale", () => {
    const messageId = "generation-mismatch-coverage";
    registerChatStreamAbortController(
      messageId,
      new AbortController(),
      "generation-current",
    );
    const close = vi.fn();

    const unsubscribe = subscribeToChatStream(
      messageId,
      { enqueue: vi.fn(), close },
      { generationId: "generation-stale" },
    );

    expect(close).toHaveBeenCalledOnce();
    expect(() => unsubscribe()).not.toThrow();
    completeChatStream(messageId, "generation-current");
  });

  it("expires terminal runs after the retention window", () => {
    vi.useFakeTimers();
    const messageId = "terminal-expiry-coverage";
    completeChatStream(messageId, "generation-terminal");

    expect(() => vi.advanceTimersByTime(5 * 60 * 1000)).not.toThrow();
  });
});
