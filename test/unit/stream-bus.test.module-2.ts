import { describe, expect, it } from "vitest";
import {
  abortChatStream,
  completeChatStream,
  hasActiveChatStream,
  publishChatStreamEvent,
  registerChatStreamAbortController,
  subscribeToChatStream,
} from "./stream-bus.test.publish-chat-stream-event";

describe("stream-bus", () => {
  describe("hasActiveChatStream", () => {
    it("returns false for unknown message", () => {
      expect(hasActiveChatStream(crypto.randomUUID())).toBe(false);
    });

    it("returns true after first publish", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text" });
      expect(hasActiveChatStream(id)).toBe(true);
    });

    it("returns false after stream is completed", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text" });
      completeChatStream(id);
      expect(hasActiveChatStream(id)).toBe(false);
    });
  });
  describe("subscribeToChatStream", () => {
    it("replays past events to new subscriber", () => {
      const id = crypto.randomUUID();
      const events = [
        { type: "text", content: "a" },
        { type: "text", content: "b" },
      ];
      for (const e of events) publishChatStreamEvent(id, e);

      const received: Record<string, unknown>[] = [];
      const closed = { value: false };
      subscribeToChatStream(id, {
        enqueue: (e) => received.push(e),
        close: () => {
          closed.value = true;
        },
      });

      expect(received).toEqual(events);
      expect(closed.value).toBe(false);
    });

    it("keeps only the most recent MAX_RUN_EVENTS on replay", async () => {
      const { MAX_RUN_EVENTS } = await import("@/modules/chat/stream-bus");
      const id = crypto.randomUUID();
      for (let i = 0; i < MAX_RUN_EVENTS + 50; i += 1) {
        publishChatStreamEvent(id, { type: "text", index: i });
      }

      const received: Array<Record<string, unknown>> = [];
      subscribeToChatStream(id, {
        enqueue: (e) => received.push(e),
        close: () => {},
      });

      expect(received).toHaveLength(MAX_RUN_EVENTS);
      expect(received[0]).toEqual({ type: "text", index: 50 });
      expect(received.at(-1)).toEqual({
        type: "text",
        index: MAX_RUN_EVENTS + 49,
      });
    });

    it("skips replay when replay=false", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text", content: "old" });

      const received: Record<string, unknown>[] = [];
      subscribeToChatStream(
        id,
        { enqueue: (e) => received.push(e), close: () => {} },
        { replay: false },
      );

      expect(received).toHaveLength(0);
    });

    it("immediately closes subscriber when stream is already done", () => {
      const id = crypto.randomUUID();
      completeChatStream(id);

      const closed = { value: false };
      subscribeToChatStream(id, {
        enqueue: () => {},
        close: () => {
          closed.value = true;
        },
      });

      expect(closed.value).toBe(true);
    });

    it("delivers new events to active subscriber", () => {
      const id = crypto.randomUUID();
      const received: Record<string, unknown>[] = [];
      subscribeToChatStream(id, {
        enqueue: (e) => received.push(e),
        close: () => {},
      });

      publishChatStreamEvent(id, { type: "delta", token: "hi" });

      expect(received).toEqual([{ type: "delta", token: "hi" }]);
    });

    it("closes subscriber when stream completes", () => {
      const id = crypto.randomUUID();
      const closed = { value: false };
      subscribeToChatStream(id, {
        enqueue: () => {},
        close: () => {
          closed.value = true;
        },
      });

      completeChatStream(id);

      expect(closed.value).toBe(true);
    });

    it("unsubscribe stops delivering events", () => {
      const id = crypto.randomUUID();
      const received: Record<string, unknown>[] = [];
      const unsubscribe = subscribeToChatStream(id, {
        enqueue: (e) => received.push(e),
        close: () => {},
      });

      unsubscribe();
      publishChatStreamEvent(id, { type: "delta" });

      expect(received).toHaveLength(0);
    });
  });
  describe("abortChatStream", () => {
    it("returns false for unknown message", () => {
      expect(abortChatStream(crypto.randomUUID())).toBe(false);
    });

    it("returns false for already completed stream", () => {
      const id = crypto.randomUUID();
      completeChatStream(id);
      expect(abortChatStream(id)).toBe(false);
    });

    it("returns true and marks stream done", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text" });

      expect(abortChatStream(id)).toBe(true);
      expect(hasActiveChatStream(id)).toBe(false);
    });

    it("calls abort on registered controller", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text" });

      const controller = new AbortController();
      registerChatStreamAbortController(id, controller);

      abortChatStream(id);

      expect(controller.signal.aborted).toBe(true);
    });

    it("starts a fresh stream when a completed message is continued", () => {
      const id = crypto.randomUUID();
      publishChatStreamEvent(id, { type: "text", delta: "old" });
      completeChatStream(id);

      registerChatStreamAbortController(id, new AbortController());
      publishChatStreamEvent(id, { type: "text", delta: "continued" });

      const received: Record<string, unknown>[] = [];
      subscribeToChatStream(id, {
        enqueue: (event) => received.push(event),
        close: () => {},
      });

      expect(received).toEqual([{ type: "text", delta: "continued" }]);
      expect(hasActiveChatStream(id)).toBe(true);
    });

    it("fences a replaced generation and retires its subscribers", () => {
      const id = crypto.randomUUID();
      const oldGeneration = crypto.randomUUID();
      const newGeneration = crypto.randomUUID();
      const oldController = new AbortController();
      const oldReceived: Record<string, unknown>[] = [];
      let oldClosed = false;

      registerChatStreamAbortController(id, oldController, oldGeneration);
      subscribeToChatStream(
        id,
        {
          enqueue: (event) => oldReceived.push(event),
          close: () => {
            oldClosed = true;
          },
        },
        { generationId: oldGeneration },
      );
      publishChatStreamEvent(id, { type: "text", delta: "old" }, oldGeneration);

      registerChatStreamAbortController(
        id,
        new AbortController(),
        newGeneration,
      );
      publishChatStreamEvent(
        id,
        { type: "text", delta: "stale" },
        oldGeneration,
      );
      completeChatStream(id, oldGeneration);

      const newReceived: Record<string, unknown>[] = [];
      publishChatStreamEvent(id, { type: "text", delta: "new" }, newGeneration);
      subscribeToChatStream(
        id,
        { enqueue: (event) => newReceived.push(event), close: () => {} },
        { generationId: newGeneration },
      );

      expect(oldController.signal.aborted).toBe(true);
      expect(oldClosed).toBe(true);
      expect(oldReceived).toEqual([{ type: "text", delta: "old" }]);
      expect(newReceived).toEqual([{ type: "text", delta: "new" }]);
      expect(hasActiveChatStream(id, newGeneration)).toBe(true);
    });
  });
});
