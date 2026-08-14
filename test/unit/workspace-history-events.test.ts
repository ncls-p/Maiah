import { afterEach, describe, expect, it, vi } from "vitest";

import { withConversationLiveState } from "@/components/workspace-history-sidebar.conversation-payload";
import {
  CONVERSATION_STREAMING_EVENT,
  notifyConversationRead,
  notifyConversationStreaming,
  subscribeWorkspaceHistoryLive,
  WORKSPACE_HISTORY_REFRESH_EVENT,
} from "@/lib/workspace-history-events";
import {
  readStreamingConversationIds,
  readUnreadConversationIds,
  reduceConversationLiveStatus,
  updateUnreadConversationIds,
  writeStreamingConversationIds,
  writeUnreadConversationIds,
} from "@/lib/workspace-history-unread";
import type { ChatConversation } from "@/components/chat/chat-types";

function conversation(id: string): ChatConversation {
  return {
    id,
    title: id,
    agentId: "agent-1",
    updatedAt: "2026-08-14T16:00:00.000Z",
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("workspace history live events", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stamps streaming and unread conversations in the history payload", () => {
    const conversations = [conversation("a"), conversation("b")];
    expect(
      withConversationLiveState(conversations, {
        streamingIds: new Set(),
        unreadIds: new Set(),
      }),
    ).toBe(conversations);
    expect(
      withConversationLiveState(conversations, {
        streamingIds: new Set(["a"]),
        unreadIds: new Set(["a", "b"]),
      }).map((item) => [item.isStreaming, item.isUnread]),
    ).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it("persists unread conversation ids per workspace", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    writeUnreadConversationIds("workspace-1", new Set(["conversation-1"]));
    expect([...readUnreadConversationIds("workspace-1")]).toEqual([
      "conversation-1",
    ]);
    expect(readUnreadConversationIds("workspace-2").size).toBe(0);
    expect(
      updateUnreadConversationIds(
        new Set(["conversation-1"]),
        "conversation-1",
        false,
      ).size,
    ).toBe(0);
  });

  it("persists streaming conversation ids per workspace", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    writeStreamingConversationIds("workspace-1", new Set(["conversation-1"]));
    expect([...readStreamingConversationIds("workspace-1")]).toEqual([
      "conversation-1",
    ]);
    expect(readStreamingConversationIds("workspace-2").size).toBe(0);
  });

  it("keeps streaming when the user leaves a generating chat", () => {
    expect(reduceConversationLiveStatus(null, "a", true)).toEqual({
      trackedStreamingId: "a",
      startId: "a",
      stopId: null,
      markStopUnread: false,
    });
    expect(reduceConversationLiveStatus("a", "a", true)).toEqual({
      trackedStreamingId: "a",
      startId: null,
      stopId: null,
      markStopUnread: false,
    });
    expect(reduceConversationLiveStatus("a", "b", false)).toEqual({
      trackedStreamingId: "a",
      startId: null,
      stopId: null,
      markStopUnread: false,
    });
    expect(reduceConversationLiveStatus("a", "b", true)).toEqual({
      trackedStreamingId: "b",
      startId: "b",
      stopId: "a",
      markStopUnread: false,
    });
    expect(reduceConversationLiveStatus("a", "a", false)).toEqual({
      trackedStreamingId: null,
      startId: null,
      stopId: "a",
      markStopUnread: true,
    });
  });

  it("notifies same-tab listeners when a reply starts streaming", () => {
    const listeners = new Map<string, Set<EventListener>>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: EventListener) => {
        const bucket = listeners.get(type) ?? new Set();
        bucket.add(listener);
        listeners.set(type, bucket);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: (event: Event) => {
        listeners.get(event.type)?.forEach((listener) => listener(event));
        return true;
      },
      localStorage: {
        setItem: vi.fn(),
      },
    });
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const onRefresh = vi.fn();
    const onStreaming = vi.fn();
    const onUnread = vi.fn();
    const unsubscribe = subscribeWorkspaceHistoryLive({
      onRefresh,
      onStreaming,
      onUnread,
    });

    notifyConversationStreaming("conversation-1", true);
    notifyConversationStreaming("conversation-1", false, { markUnread: false });
    notifyConversationRead("conversation-1");

    expect(onStreaming).toHaveBeenNthCalledWith(
      1,
      "conversation-1",
      true,
      false,
    );
    expect(onStreaming).toHaveBeenNthCalledWith(
      2,
      "conversation-1",
      false,
      false,
    );
    expect(onUnread).toHaveBeenCalledWith("conversation-1", false);
    expect(onRefresh).toHaveBeenCalled();
    expect(CONVERSATION_STREAMING_EVENT).toBe("maiah:conversation-streaming");
    expect(WORKSPACE_HISTORY_REFRESH_EVENT).toBe(
      "maiah:workspace-history-refresh",
    );

    unsubscribe();
  });
});
