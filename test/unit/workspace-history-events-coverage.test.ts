import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONVERSATION_STREAMING_EVENT,
  CONVERSATION_UNREAD_EVENT,
  notifyConversationRead,
  notifyConversationStreaming,
  notifyWorkspaceHistoryChanged,
  subscribeWorkspaceHistoryLive,
} from "@/lib/workspace-history-events";

function installBrowserFakes() {
  const windowListeners = new Map<string, Set<EventListener>>();
  const documentListeners = new Map<string, Set<EventListener>>();
  const documentState = { hidden: false };
  const add = (
    listeners: Map<string, Set<EventListener>>,
    type: string,
    listener: EventListener,
  ) => {
    const bucket = listeners.get(type) ?? new Set<EventListener>();
    bucket.add(listener);
    listeners.set(type, bucket);
  };
  const remove = (
    listeners: Map<string, Set<EventListener>>,
    type: string,
    listener: EventListener,
  ) => listeners.get(type)?.delete(listener);
  const dispatch = (
    listeners: Map<string, Set<EventListener>>,
    event: Event,
  ) => {
    listeners.get(event.type)?.forEach((listener) => listener(event));
    return true;
  };

  const windowFake = {
    addEventListener: (type: string, listener: EventListener) =>
      add(windowListeners, type, listener),
    removeEventListener: (type: string, listener: EventListener) =>
      remove(windowListeners, type, listener),
    dispatchEvent: (event: Event) => dispatch(windowListeners, event),
    localStorage: { setItem: vi.fn() },
  };
  const documentFake = {
    get hidden() {
      return documentState.hidden;
    },
    addEventListener: (type: string, listener: EventListener) =>
      add(documentListeners, type, listener),
    removeEventListener: (type: string, listener: EventListener) =>
      remove(documentListeners, type, listener),
  };
  vi.stubGlobal("window", windowFake);
  vi.stubGlobal("document", documentFake);
  return {
    documentState,
    dispatchDocument: (event: Event) => dispatch(documentListeners, event),
    dispatchWindow: (event: Event) => dispatch(windowListeners, event),
    windowFake,
  };
}

describe("workspace history event fallbacks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is inert outside the browser", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("BroadcastChannel", undefined);

    notifyWorkspaceHistoryChanged("workspace-a");
    notifyConversationStreaming("workspace-a", "conversation-a", true);
    notifyConversationRead("workspace-a", "conversation-a");
    expect(
      subscribeWorkspaceHistoryLive("workspace-a", {
        onRefresh: vi.fn(),
      }),
    ).toBeTypeOf("function");
  });

  it("contains unavailable channels and storage without losing same-tab events", () => {
    const browser = installBrowserFakes();
    browser.windowFake.localStorage.setItem.mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.stubGlobal(
      "BroadcastChannel",
      class BrokenBroadcastChannel {
        constructor() {
          throw new Error("channels disabled");
        }
      },
    );
    const onRefresh = vi.fn();
    const unsubscribe = subscribeWorkspaceHistoryLive("workspace-a", {
      onRefresh,
    });

    notifyWorkspaceHistoryChanged("workspace-a");

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(browser.windowFake.localStorage.setItem).toHaveBeenCalledOnce();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("handles lifecycle events and every remote channel message by workspace", () => {
    const browser = installBrowserFakes();

    class FakeBroadcastChannel {
      static instances: FakeBroadcastChannel[] = [];
      onmessage: ((event: MessageEvent) => void) | null = null;
      close = vi.fn();

      constructor(readonly name: string) {
        FakeBroadcastChannel.instances.push(this);
      }

      postMessage(data: unknown) {
        for (const instance of FakeBroadcastChannel.instances) {
          if (instance.name === this.name) {
            instance.onmessage?.({ data } as MessageEvent);
          }
        }
      }
    }

    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const onRefresh = vi.fn();
    const onStreaming = vi.fn();
    const onUnread = vi.fn();
    const unsubscribe = subscribeWorkspaceHistoryLive("workspace-a", {
      onRefresh,
      onStreaming,
      onUnread,
    });
    const subscriber = FakeBroadcastChannel.instances[0];

    const storageEvent = (key: string) => {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: key });
      return event;
    };
    browser.dispatchWindow(storageEvent("unrelated-storage-key"));
    browser.dispatchWindow(
      storageEvent("maiah:workspace-history-revision:workspace-a"),
    );
    for (const type of ["focus", "online", "pageshow"]) {
      browser.dispatchWindow(new Event(type));
    }
    browser.documentState.hidden = true;
    browser.dispatchDocument(new Event("visibilitychange"));
    browser.documentState.hidden = false;
    browser.dispatchDocument(new Event("visibilitychange"));

    browser.dispatchWindow(
      new CustomEvent(CONVERSATION_STREAMING_EVENT, {
        detail: { workspaceId: "workspace-b", conversationId: "ignored" },
      }),
    );
    browser.dispatchWindow(
      new CustomEvent(CONVERSATION_UNREAD_EVENT, {
        detail: {
          workspaceId: "workspace-a",
          conversationId: "local-conversation",
          unread: true,
        },
      }),
    );
    subscriber.onmessage?.({
      data: {
        type: "refresh",
        workspaceId: "workspace-a",
        senderId: "remote",
      },
    } as MessageEvent);
    subscriber.onmessage?.({
      data: {
        type: "streaming",
        workspaceId: "workspace-a",
        senderId: "remote",
        conversationId: "remote-stream",
        streaming: false,
        markUnread: true,
      },
    } as MessageEvent);
    subscriber.onmessage?.({
      data: {
        type: "unread",
        workspaceId: "workspace-a",
        senderId: "remote",
        conversationId: "remote-unread",
        unread: false,
      },
    } as MessageEvent);

    expect(onRefresh).toHaveBeenCalledTimes(6);
    expect(onStreaming).toHaveBeenCalledWith("remote-stream", false, true);
    expect(onUnread).toHaveBeenCalledWith("local-conversation", true);
    expect(onUnread).toHaveBeenCalledWith("remote-unread", false);

    unsubscribe();
    expect(subscriber.close).toHaveBeenCalledOnce();
    browser.dispatchWindow(new Event("focus"));
    expect(onRefresh).toHaveBeenCalledTimes(6);
  });
});
