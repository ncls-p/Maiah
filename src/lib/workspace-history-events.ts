export const WORKSPACE_HISTORY_REFRESH_EVENT =
  "maiah:workspace-history-refresh";
export const CONVERSATION_STREAMING_EVENT = "maiah:conversation-streaming";
export const CONVERSATION_UNREAD_EVENT = "maiah:conversation-unread";

const CHANNEL_NAME = "maiah-workspace-history";
const STORAGE_KEY = "maiah:workspace-history-revision";

type HistoryChannelMessage =
  | { type: "refresh"; workspaceId: string; senderId: string }
  | {
      type: "streaming";
      workspaceId: string;
      senderId: string;
      conversationId: string;
      streaming: boolean;
      markUnread: boolean;
    }
  | {
      type: "unread";
      workspaceId: string;
      senderId: string;
      conversationId: string;
      unread: boolean;
    };

type WorkspaceHistoryRefreshDetail = { workspaceId: string };

type ConversationStreamingDetail = {
  workspaceId: string;
  conversationId: string;
  streaming: boolean;
  markUnread: boolean;
};

type ConversationUnreadDetail = {
  workspaceId: string;
  conversationId: string;
  unread: boolean;
};

let publisher: BroadcastChannel | null = null;
let revision = 0;
const senderId =
  globalThis.crypto?.randomUUID?.() ??
  `history-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function postHistoryMessage(message: HistoryChannelMessage) {
  if (
    typeof window === "undefined" ||
    typeof BroadcastChannel === "undefined"
  ) {
    return false;
  }
  try {
    publisher ??= new BroadcastChannel(CHANNEL_NAME);
    publisher.postMessage(message);
    return true;
  } catch {
    publisher = null;
    // Private mode and unsupported browsers still get same-tab events.
    return false;
  }
}

function bumpHistoryStorage(workspaceId: string) {
  if (typeof window === "undefined") return;
  try {
    revision += 1;
    window.localStorage.setItem(
      `${STORAGE_KEY}:${workspaceId}`,
      `${Date.now()}:${revision}`,
    );
  } catch {
    // Ignore quota / access errors; same-tab listeners still run.
  }
}

export function notifyWorkspaceHistoryChanged(workspaceId: string | null) {
  if (typeof window === "undefined" || !workspaceId) return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceHistoryRefreshDetail>(
      WORKSPACE_HISTORY_REFRESH_EVENT,
      { detail: { workspaceId } },
    ),
  );
  const broadcasted = postHistoryMessage({
    type: "refresh",
    workspaceId,
    senderId,
  });
  if (!broadcasted) bumpHistoryStorage(workspaceId);
}

export function notifyConversationStreaming(
  workspaceId: string | null | undefined,
  conversationId: string | null | undefined,
  streaming: boolean,
  options?: { markUnread?: boolean },
) {
  if (typeof window === "undefined" || !workspaceId || !conversationId) return;
  const detail: ConversationStreamingDetail = {
    workspaceId,
    conversationId,
    streaming,
    markUnread: streaming ? false : options?.markUnread !== false,
  };
  window.dispatchEvent(
    new CustomEvent<ConversationStreamingDetail>(CONVERSATION_STREAMING_EVENT, {
      detail,
    }),
  );
  postHistoryMessage({ type: "streaming", senderId, ...detail });
  notifyWorkspaceHistoryChanged(workspaceId);
}

export function notifyConversationRead(
  workspaceId: string | null | undefined,
  conversationId: string | null | undefined,
) {
  if (typeof window === "undefined" || !workspaceId || !conversationId) return;
  const detail: ConversationUnreadDetail = {
    workspaceId,
    conversationId,
    unread: false,
  };
  window.dispatchEvent(
    new CustomEvent<ConversationUnreadDetail>(CONVERSATION_UNREAD_EVENT, {
      detail,
    }),
  );
  postHistoryMessage({ type: "unread", senderId, ...detail });
  notifyWorkspaceHistoryChanged(workspaceId);
}

export function subscribeWorkspaceHistoryLive(
  workspaceId: string,
  handlers: {
    onRefresh: () => void;
    onStreaming?: (
      conversationId: string,
      streaming: boolean,
      markUnread: boolean,
    ) => void;
    onUnread?: (conversationId: string, unread: boolean) => void;
  },
) {
  if (typeof window === "undefined") return () => undefined;

  const onRefresh = (event?: Event) => {
    const detail = (
      event as CustomEvent<WorkspaceHistoryRefreshDetail> | undefined
    )?.detail;
    if (detail?.workspaceId && detail.workspaceId !== workspaceId) return;
    handlers.onRefresh();
  };
  const onStreamingEvent = (event: Event) => {
    const detail = (event as CustomEvent<ConversationStreamingDetail>).detail;
    if (!detail?.conversationId || detail.workspaceId !== workspaceId) return;
    handlers.onStreaming?.(
      detail.conversationId,
      detail.streaming,
      detail.markUnread,
    );
  };
  const onUnreadEvent = (event: Event) => {
    const detail = (event as CustomEvent<ConversationUnreadDetail>).detail;
    if (!detail?.conversationId || detail.workspaceId !== workspaceId) return;
    handlers.onUnread?.(detail.conversationId, detail.unread);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === `${STORAGE_KEY}:${workspaceId}`) onRefresh();
  };
  const onVisible = () => {
    if (!document.hidden) onRefresh();
  };

  window.addEventListener(WORKSPACE_HISTORY_REFRESH_EVENT, onRefresh);
  window.addEventListener(CONVERSATION_STREAMING_EVENT, onStreamingEvent);
  window.addEventListener(CONVERSATION_UNREAD_EVENT, onUnreadEvent);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onRefresh);
  window.addEventListener("online", onRefresh);
  window.addEventListener("pageshow", onRefresh);
  document.addEventListener("visibilitychange", onVisible);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<HistoryChannelMessage>) => {
        const message = event.data;
        if (message?.senderId === senderId) return;
        if (message?.workspaceId !== workspaceId) return;
        if (message?.type === "refresh") {
          onRefresh();
          return;
        }
        if (message?.type === "streaming") {
          handlers.onStreaming?.(
            message.conversationId,
            message.streaming,
            message.markUnread,
          );
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
    window.removeEventListener("focus", onRefresh);
    window.removeEventListener("online", onRefresh);
    window.removeEventListener("pageshow", onRefresh);
    document.removeEventListener("visibilitychange", onVisible);
    channel?.close();
  };
}
