export const WORKSPACE_HISTORY_REFRESH_EVENT =
  "maiah:workspace-history-refresh";
export const CONVERSATION_STREAMING_EVENT = "maiah:conversation-streaming";
export const CONVERSATION_UNREAD_EVENT = "maiah:conversation-unread";

const CHANNEL_NAME = "maiah-workspace-history";
const STORAGE_KEY = "maiah:workspace-history-revision";

type HistoryChannelMessage =
  | { type: "refresh" }
  | { type: "streaming"; conversationId: string; streaming: boolean }
  | { type: "unread"; conversationId: string; unread: boolean };

type ConversationStreamingDetail = {
  conversationId: string;
  streaming: boolean;
};

type ConversationUnreadDetail = {
  conversationId: string;
  unread: boolean;
};

function postHistoryMessage(message: HistoryChannelMessage) {
  if (
    typeof window === "undefined" ||
    typeof BroadcastChannel === "undefined"
  ) {
    return;
  }
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  } catch {
    // Private mode and unsupported browsers still get same-tab events.
  }
}

function bumpHistoryStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore quota / access errors; same-tab listeners still run.
  }
}

export function notifyWorkspaceHistoryChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKSPACE_HISTORY_REFRESH_EVENT));
  postHistoryMessage({ type: "refresh" });
  bumpHistoryStorage();
}

export function notifyConversationStreaming(
  conversationId: string | null | undefined,
  streaming: boolean,
) {
  if (typeof window === "undefined" || !conversationId) return;
  const detail: ConversationStreamingDetail = { conversationId, streaming };
  window.dispatchEvent(
    new CustomEvent<ConversationStreamingDetail>(CONVERSATION_STREAMING_EVENT, {
      detail,
    }),
  );
  postHistoryMessage({ type: "streaming", ...detail });
  notifyWorkspaceHistoryChanged();
}

export function notifyConversationRead(
  conversationId: string | null | undefined,
) {
  if (typeof window === "undefined" || !conversationId) return;
  const detail: ConversationUnreadDetail = {
    conversationId,
    unread: false,
  };
  window.dispatchEvent(
    new CustomEvent<ConversationUnreadDetail>(CONVERSATION_UNREAD_EVENT, {
      detail,
    }),
  );
  postHistoryMessage({ type: "unread", ...detail });
}

export function subscribeWorkspaceHistoryLive(handlers: {
  onRefresh: () => void;
  onStreaming?: (conversationId: string, streaming: boolean) => void;
  onUnread?: (conversationId: string, unread: boolean) => void;
}) {
  if (typeof window === "undefined") return () => undefined;

  const onRefresh = () => handlers.onRefresh();
  const onStreamingEvent = (event: Event) => {
    const detail = (event as CustomEvent<ConversationStreamingDetail>).detail;
    if (!detail?.conversationId) return;
    handlers.onStreaming?.(detail.conversationId, detail.streaming);
  };
  const onUnreadEvent = (event: Event) => {
    const detail = (event as CustomEvent<ConversationUnreadDetail>).detail;
    if (!detail?.conversationId) return;
    handlers.onUnread?.(detail.conversationId, detail.unread);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onRefresh();
  };
  const onVisible = () => {
    if (!document.hidden) onRefresh();
  };

  window.addEventListener(WORKSPACE_HISTORY_REFRESH_EVENT, onRefresh);
  window.addEventListener(CONVERSATION_STREAMING_EVENT, onStreamingEvent);
  window.addEventListener(CONVERSATION_UNREAD_EVENT, onUnreadEvent);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<HistoryChannelMessage>) => {
        const message = event.data;
        if (message?.type === "refresh") {
          onRefresh();
          return;
        }
        if (message?.type === "streaming") {
          handlers.onStreaming?.(message.conversationId, message.streaming);
          return;
        }
        if (message?.type === "unread") {
          handlers.onUnread?.(message.conversationId, message.unread);
        }
      };
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener(WORKSPACE_HISTORY_REFRESH_EVENT, onRefresh);
    window.removeEventListener(CONVERSATION_STREAMING_EVENT, onStreamingEvent);
    window.removeEventListener(CONVERSATION_UNREAD_EVENT, onUnreadEvent);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
    channel?.close();
  };
}
