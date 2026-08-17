import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  updateChain.set.mockReturnValue(updateChain);
  updateChain.where.mockReturnValue(updateChain);
  return {
    db: { update: vi.fn(() => updateChain) },
    updateChain,
  };
});

vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn(async (value: string) => `encrypted:${value}`),
}));

vi.mock("@/server/infrastructure/db", () => ({ db: mocks.db }));

import {
  CHAT_STREAM_HEARTBEAT_MS,
  CHAT_STREAM_PREPARATION_LEASE_MS,
  ChatStreamHardTimeoutError,
  chatStreamLeaseValues,
  isChatStreamHardTimeoutAbort,
  startChatStreamLeaseHeartbeat,
} from "@/modules/chat/chat-stream-lease";

describe("chat stream lease heartbeat lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateChain.set.mockReturnValue(mocks.updateChain);
    mocks.updateChain.where.mockReturnValue(mocks.updateChain);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a unique generation with a bounded preparation lease", () => {
    const now = new Date("2026-08-17T08:00:00.000Z");
    const first = chatStreamLeaseValues(now);
    const second = chatStreamLeaseValues(now);

    expect(first).toMatchObject({
      streamStartedAt: now,
      streamHeartbeatAt: now,
      streamLeaseExpiresAt: new Date(
        now.getTime() + CHAT_STREAM_PREPARATION_LEASE_MS,
      ),
    });
    expect(first.streamGenerationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second.streamGenerationId).not.toBe(first.streamGenerationId);
  });

  it("aborts a producer that no longer owns the durable stream lease", async () => {
    vi.useFakeTimers();
    mocks.updateChain.returning.mockResolvedValueOnce([]);
    const controller = new AbortController();

    const stop = startChatStreamLeaseHeartbeat(
      "message-a",
      "generation-a",
      controller,
    );
    await stop();

    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toMatchObject({
      message: "Chat stream was cancelled or lost its lease",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("contains a transient heartbeat database failure", async () => {
    vi.useFakeTimers();
    mocks.updateChain.returning.mockRejectedValueOnce(
      new Error("database temporarily unavailable"),
    );
    const controller = new AbortController();

    const stop = startChatStreamLeaseHeartbeat(
      "message-a",
      "generation-a",
      controller,
    );
    await expect(stop()).resolves.toBeUndefined();

    expect(controller.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not overlap heartbeats when one database update is still pending", async () => {
    vi.useFakeTimers();
    let finishFirstHeartbeat: (rows: Array<{ id: string }>) => void = () => {};
    const firstHeartbeat = new Promise<Array<{ id: string }>>((resolve) => {
      finishFirstHeartbeat = resolve;
    });
    mocks.updateChain.returning
      .mockReturnValueOnce(firstHeartbeat)
      .mockResolvedValueOnce([{ id: "message-a" }]);
    const controller = new AbortController();
    const stop = startChatStreamLeaseHeartbeat(
      "message-a",
      "generation-a",
      controller,
    );

    await vi.advanceTimersByTimeAsync(CHAT_STREAM_HEARTBEAT_MS);
    expect(mocks.updateChain.returning).toHaveBeenCalledOnce();

    finishFirstHeartbeat([{ id: "message-a" }]);
    await firstHeartbeat;
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(CHAT_STREAM_HEARTBEAT_MS);
    expect(mocks.updateChain.returning).toHaveBeenCalledTimes(2);

    await stop();
    expect(controller.signal.aborted).toBe(false);
  });

  it("stops renewing and invokes the terminal callback at the hard runtime cap", async () => {
    vi.useFakeTimers();
    mocks.updateChain.returning.mockResolvedValue([{ id: "message-a" }]);
    const controller = new AbortController();
    const onHardTimeout = vi.fn(async () => undefined);
    const stop = startChatStreamLeaseHeartbeat(
      "message-a",
      "generation-a",
      controller,
      { hardTimeoutMs: 100, onHardTimeout },
    );

    await vi.advanceTimersByTimeAsync(100);

    expect(controller.signal.reason).toBeInstanceOf(ChatStreamHardTimeoutError);
    expect(isChatStreamHardTimeoutAbort(controller.signal)).toBe(true);
    expect(onHardTimeout).toHaveBeenCalledOnce();
    const updatesAtTimeout = mocks.updateChain.returning.mock.calls.length;

    await vi.advanceTimersByTimeAsync(CHAT_STREAM_HEARTBEAT_MS * 2);
    expect(mocks.updateChain.returning).toHaveBeenCalledTimes(updatesAtTimeout);

    await stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
