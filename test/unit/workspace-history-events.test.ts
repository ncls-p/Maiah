import { afterEach, describe, expect, it, vi } from "vitest";

import { withConversationLiveState } from "@/components/workspace-history-sidebar.conversation-payload";
import {
  CONVERSATION_STREAMING_EVENT,
  notifyConversationRead,
  notifyConversationStreaming,
  subscribeWorkspaceHistoryLive,
  WORKSPACE_HISTORY_REFRESH_EVENT,
} from "@/lib/workspace-history-events";
import { updateUnreadConversationIds } from "@/lib/workspace-history-unread";
import { attachConversationLiveState } from "@/modules/chat/conversation-list-live-state";
import type { ChatConversation } from "@/components/chat/chat-types";

function conversation(id: string): ChatConversation {
  return {
    id,
    title: id,
    agentId: "agent-1",
    updatedAt: "2026-08-14T16:00:00.000Z",
  };
}

describe("workspace history live state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stamps optimistic streaming and unread state", () => {
    const conversations = [conversation("a"), conversation("b")];
    expect(
      withConversationLiveState(conversations, {
        streamingIds: new Set(),
        unreadIds: new Set(),
      }),
    ).toEqual([
      { ...conversation("a"), isStreaming: false, isUnread: false },
      { ...conversation("b"), isStreaming: false, isUnread: false },
    ]);
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

  it("derives authoritative spinner and unread state from persisted messages", () => {
    const conversations = [conversation("stream"), conversation("done")];
    const beforeCompletion = new Date("2026-08-14T15:59:00.000Z");
    const completion = new Date("2026-08-14T16:01:00.000Z");
    const result = attachConversationLiveState(
      conversations,
      [
        {
          conversationId: "stream",
          messageId: "assistant-stream",
          status: "streaming",
          createdAt: new Date("2026-08-14T16:00:00.000Z"),
          completedAt: null,
        },
        {
          conversationId: "done",
          messageId: "assistant-done",
          status: "completed",
          createdAt: new Date("2026-08-14T16:00:00.000Z"),
          completedAt: completion,
        },
      ],
      [{ conversationId: "done", lastReadAt: beforeCompletion }],
    );

    expect(result[0]).toMatchObject({
      isStreaming: true,
      isUnread: false,
      latestAssistantMessageId: "assistant-stream",
    });
    expect(result[1]).toMatchObject({
      isStreaming: false,
      isUnread: true,
      latestAssistantCompletedAt: completion.toISOString(),
    });
  });

  it("clears unread after a receipt newer than the assistant completion", () => {
    const result = attachConversationLiveState(
      [conversation("done")],
      [
        {
          conversationId: "done",
          messageId: "assistant-done",
          status: "failed",
          createdAt: new Date("2026-08-14T16:00:00.000Z"),
          completedAt: new Date("2026-08-14T16:01:00.000Z"),
        },
      ],
      [
        {
          conversationId: "done",
          lastReadAt: new Date("2026-08-14T16:02:00.000Z"),
        },
      ],
    );
    expect(result[0]).toMatchObject({ isStreaming: false, isUnread: false });
  });

  it("updates a conversation id set without mutating the previous snapshot", () => {
    const current = new Set(["a"]);
    const next = updateUnreadConversationIds(current, "b", true);
    expect([...current]).toEqual(["a"]);
    expect([...next]).toEqual(["a", "b"]);
    expect(updateUnreadConversationIds(next, "b", true)).toBe(next);
  });

  it("scopes same-tab events and storage fallback to one workspace", () => {
    const listeners = new Map<string, Set<EventListener>>();
    const storageWrites: Array<[string, string]> = [];
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
        setItem: (key: string, value: string) =>
          storageWrites.push([key, value]),
      },
    });
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("document", {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const onRefresh = vi.fn();
    const onStreaming = vi.fn();
    const onUnread = vi.fn();
    const unsubscribe = subscribeWorkspaceHistoryLive("workspace-1", {
      onRefresh,
      onStreaming,
      onUnread,
    });

    notifyConversationStreaming("workspace-2", "conversation-2", true);
    notifyConversationStreaming("workspace-1", "conversation-1", true);
    notifyConversationRead("workspace-1", "conversation-1");

    expect(onStreaming).toHaveBeenCalledTimes(1);
    expect(onStreaming).toHaveBeenCalledWith("conversation-1", true, false);
    expect(onUnread).toHaveBeenCalledWith("conversation-1", false);
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(storageWrites.map(([key]) => key)).toContain(
      "maiah:workspace-history-revision:workspace-1",
    );
    expect(CONVERSATION_STREAMING_EVENT).toBe("maiah:conversation-streaming");
    expect(WORKSPACE_HISTORY_REFRESH_EVENT).toBe(
      "maiah:workspace-history-refresh",
    );

    unsubscribe();
  });

  it("delivers remote broadcasts once without echoing local events", () => {
    class FakeBroadcastChannel {
      static instances: FakeBroadcastChannel[] = [];
      onmessage: ((event: MessageEvent) => void) | null = null;
      closed = false;

      constructor(readonly name: string) {
        FakeBroadcastChannel.instances.push(this);
      }

      postMessage(data: unknown) {
        for (const instance of FakeBroadcastChannel.instances) {
          if (instance.closed || instance.name !== this.name) continue;
          instance.onmessage?.({ data } as MessageEvent);
        }
      }

      close() {
        this.closed = true;
      }
    }

    const listeners = new Map<string, Set<EventListener>>();
    const storageSetItem = vi.fn();
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
      localStorage: { setItem: storageSetItem },
    });
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    vi.stubGlobal("document", {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const onRefresh = vi.fn();
    const onStreaming = vi.fn();
    const unsubscribe = subscribeWorkspaceHistoryLive("workspace-1", {
      onRefresh,
      onStreaming,
    });
    const subscriber = FakeBroadcastChannel.instances[0];

    subscriber.onmessage?.({
      data: {
        type: "refresh",
        workspaceId: "workspace-2",
        senderId: "remote-tab",
      },
    } as MessageEvent);
    subscriber.onmessage?.({
      data: {
        type: "streaming",
        workspaceId: "workspace-1",
        senderId: "remote-tab",
        conversationId: "remote-conversation",
        streaming: true,
        markUnread: false,
      },
    } as MessageEvent);
    notifyConversationStreaming("workspace-1", "local-conversation", true);

    expect(onStreaming).toHaveBeenCalledTimes(2);
    expect(onStreaming).toHaveBeenNthCalledWith(
      1,
      "remote-conversation",
      true,
      false,
    );
    expect(onStreaming).toHaveBeenNthCalledWith(
      2,
      "local-conversation",
      true,
      false,
    );
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(storageSetItem).not.toHaveBeenCalled();

    unsubscribe();
  });
});
