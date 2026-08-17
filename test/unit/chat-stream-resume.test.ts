import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/components/chat/chat-types";
import {
  waitForAbortableResumeDelay,
  waitForChatResumeSource,
} from "@/hooks/use-chat-stream.resume";

const MESSAGE_ID = "assistant-message";

function message(status: string): ChatMessage {
  return {
    id: MESSAGE_ID,
    role: "assistant",
    status,
    parts: [],
    createdAt: "2026-08-17T06:00:00.000Z",
  };
}

function pendingResponse(retryAfterMs?: number) {
  return Response.json(
    retryAfterMs === undefined ? { active: true } : { retryAfterMs },
    { status: 202 },
  );
}

describe("chat stream resume polling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits through repeated 202 responses until reload confirms a terminal message", async () => {
    const controller = new AbortController();
    const requestStream = vi
      .fn<(signal: AbortSignal) => Promise<Response>>()
      .mockResolvedValueOnce(pendingResponse(100))
      .mockResolvedValueOnce(pendingResponse(8_000));
    const reloadMessages = vi
      .fn<(signal: AbortSignal) => Promise<ChatMessage[] | null>>()
      .mockResolvedValueOnce([message("streaming")])
      .mockResolvedValueOnce([message("completed")]);
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await waitForChatResumeSource({
      signal: controller.signal,
      messageId: MESSAGE_ID,
      requestStream,
      reloadMessages,
      wait,
    });

    expect(result).toEqual({
      kind: "terminal",
      messages: [message("completed")],
    });
    expect(requestStream).toHaveBeenCalledTimes(2);
    expect(reloadMessages).toHaveBeenCalledTimes(2);
    expect(reloadMessages).toHaveBeenCalledWith(controller.signal);
    expect(wait.mock.calls.map(([, delayMs]) => delayMs)).toEqual([500, 5_000]);
  });

  it("retries temporarily unavailable and rejected reloads after 404 or 409", async () => {
    const controller = new AbortController();
    const requestStream = vi
      .fn<(signal: AbortSignal) => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 409 }));
    const reloadMessages = vi
      .fn<(signal: AbortSignal) => Promise<ChatMessage[] | null>>()
      .mockRejectedValueOnce(new TypeError("temporary network failure"))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([message("failed")]);
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await waitForChatResumeSource({
      signal: controller.signal,
      messageId: MESSAGE_ID,
      requestStream,
      reloadMessages,
      wait,
    });

    expect(result).toEqual({
      kind: "terminal",
      messages: [message("failed")],
    });
    expect(requestStream).toHaveBeenCalledTimes(1);
    expect(reloadMessages).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("stops retrying a persistently unavailable reload instead of spinning forever", async () => {
    const controller = new AbortController();
    const requestStream = vi
      .fn<(signal: AbortSignal) => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 404 }));
    const reloadMessages = vi
      .fn<(signal: AbortSignal) => Promise<ChatMessage[] | null>>()
      .mockResolvedValue(null);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForChatResumeSource({
        signal: controller.signal,
        messageId: MESSAGE_ID,
        requestStream,
        reloadMessages,
        wait,
      }),
    ).rejects.toThrow(
      "Failed to reload conversation while resuming chat stream",
    );
    expect(requestStream).toHaveBeenCalledTimes(1);
    expect(reloadMessages).toHaveBeenCalledTimes(5);
    expect(wait).toHaveBeenCalledTimes(4);
  });

  it("does not report a 404 or 409 as terminal while reload still says streaming", async () => {
    const controller = new AbortController();
    const streamResponse = new Response("stream", { status: 200 });
    const requestStream = vi
      .fn<(signal: AbortSignal) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(streamResponse);
    const reloadMessages = vi
      .fn<(signal: AbortSignal) => Promise<ChatMessage[] | null>>()
      .mockResolvedValue([message("streaming")]);
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await waitForChatResumeSource({
      signal: controller.signal,
      messageId: MESSAGE_ID,
      requestStream,
      reloadMessages,
      wait,
    });

    expect(result).toEqual({ kind: "stream", response: streamResponse });
    expect(requestStream).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(controller.signal, 2_000);
  });

  it("removes its abort listener and timer when a retry is cancelled", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const addEventListener = vi.spyOn(controller.signal, "addEventListener");
    const removeEventListener = vi.spyOn(
      controller.signal,
      "removeEventListener",
    );

    const waiting = waitForAbortableResumeDelay(controller.signal, 30_000);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
