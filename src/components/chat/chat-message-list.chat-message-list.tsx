"use client";

import { useLocale, useTranslations } from "next-intl";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  cancelsChatStreamFollow,
  getChatStreamFollowKey,
  isChatViewportAtEnd,
  pinChatViewportToEnd,
} from "@/components/chat/chat-scroll";
import { type ChatMessage } from "@/components/chat/chat-types";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatMessageListView } from "./chat-message-list.chat-message-list.view";
import {
  ChatMessageListProps,
  INITIAL_VISIBLE_MESSAGES,
  userMessageFullText,
  userMessagePreview,
} from "./chat-message-list.initial-visible-messages";

export function useChatMessageListController({
  messages,
  sending,
  loading,
  workspaceId,
  workspaceArtifactDisplay = "full",
  conversationId,
  bottomRef,
  onEditMessage,
  onDeleteMessage,
  onResendMessage,
  onRegenerateAssistant,
  onContinueAssistant,
  onForkMessage,
  onNavigateBranch,
  forkingMessageId,
  onJumpLatest,
  pendingApprovals = [],
  onApproveTool,
  onRejectTool,
  onSuggestionClick,
}: ChatMessageListProps) {
  const locale = useLocale();
  const t = useTranslations("chat.messageList");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [visibleMessageCount, setVisibleMessageCount] = useState(
    INITIAL_VISIBLE_MESSAGES,
  );
  const [listConversationId, setListConversationId] = useState(conversationId);

  // Reset list UI when switching conversations (adjust state during render).
  if (conversationId !== listConversationId) {
    setListConversationId(conversationId);
    setVisibleMessageCount(INITIAL_VISIBLE_MESSAGES);
    setEditingMessageId(null);
    setEditingContent("");
    setSavingMessageId(null);
  }
  const hiddenMessageCount = Math.max(0, messages.length - visibleMessageCount);
  const visibleMessages = useMemo(
    () =>
      hiddenMessageCount > 0 ? messages.slice(hiddenMessageCount) : messages,
    [hiddenMessageCount, messages],
  );
  const messageIndexById = useMemo(
    () => new Map(messages.map((message, index) => [message.id, index])),
    [messages],
  );
  const userMessageShortcuts = useMemo(
    () =>
      messages
        .flatMap((message, messageIndex) =>
          message.role === "user"
            ? [
                {
                  id: message.id,
                  messageIndex,
                  ordinal: 0,
                  preview: userMessagePreview(message, t),
                  fullText: userMessageFullText(message, t),
                },
              ]
            : [],
        )
        .map((shortcut, index) => ({ ...shortcut, ordinal: index + 1 })),
    [messages, t],
  );
  const messageListMeta = useMemo(() => {
    const precedingUserByMessageId = new Map<string, ChatMessage | null>();
    let lastUserMessage: ChatMessage | null = null;
    let lastAssistantMessageId: string | undefined;
    for (const message of visibleMessages) {
      precedingUserByMessageId.set(message.id, lastUserMessage);
      if (message.role === "assistant") lastAssistantMessageId = message.id;
      if (message.role === "user") lastUserMessage = message;
    }
    return { lastAssistantMessageId, precedingUserByMessageId };
  }, [visibleMessages]);
  const lastMessage = messages[messages.length - 1] ?? null;
  const lastMessageId = lastMessage?.id ?? null;
  const hasTranscript = !loading && messages.length > 0;
  const scrollFollowKey = useMemo(
    () => getChatStreamFollowKey(messages),
    [messages],
  );

  // Follow every streamed layout change while the reader remains at the end.
  // Scrolling up opts out immediately and preserves the reader's position.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowStreamRef = useRef(true);
  const isDraggingScrollbarRef = useRef(false);

  useLayoutEffect(() => {
    shouldFollowStreamRef.current = true;
  }, [conversationId]);

  useLayoutEffect(() => {
    if (!hasTranscript) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateFollowStream = () => {
      if (isChatViewportAtEnd(viewport)) {
        shouldFollowStreamRef.current = true;
      } else if (isDraggingScrollbarRef.current) {
        shouldFollowStreamRef.current = false;
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) shouldFollowStreamRef.current = false;
    };
    const handleTouchMove = () => {
      shouldFollowStreamRef.current = false;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (cancelsChatStreamFollow(event)) {
        shouldFollowStreamRef.current = false;
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      isDraggingScrollbarRef.current = event.target === viewport;
    };
    const handlePointerUp = () => {
      isDraggingScrollbarRef.current = false;
    };

    updateFollowStream();
    viewport.addEventListener("scroll", updateFollowStream, { passive: true });
    viewport.addEventListener("wheel", handleWheel, { passive: true });
    viewport.addEventListener("touchmove", handleTouchMove, { passive: true });
    viewport.addEventListener("keydown", handleKeyDown);
    viewport.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      viewport.removeEventListener("scroll", updateFollowStream);
      viewport.removeEventListener("wheel", handleWheel);
      viewport.removeEventListener("touchmove", handleTouchMove);
      viewport.removeEventListener("keydown", handleKeyDown);
      viewport.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [hasTranscript]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !shouldFollowStreamRef.current) return;
    pinChatViewportToEnd(viewport);
  }, [scrollFollowKey, pendingApprovals.length]);

  useLayoutEffect(() => {
    if (!hasTranscript) return;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (!shouldFollowStreamRef.current) return;
      pinChatViewportToEnd(viewport);
    });
    observer.observe(content);

    return () => observer.disconnect();
  }, [hasTranscript]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Skeleton className="h-20 w-2/3 rounded-2xl" />
        <Skeleton className="ml-auto h-16 w-1/2 rounded-2xl" />
        <Skeleton className="h-24 w-3/4 rounded-2xl" />
      </div>
    );
  }

  if (messages.length === 0) {
    return <div ref={bottomRef} />;
  }

  const { lastAssistantMessageId, precedingUserByMessageId } = messageListMeta;

  const viewportClassName =
    workspaceArtifactDisplay === "summary"
      ? "px-2 py-3"
      : "px-3 py-4 sm:px-4 sm:py-8";

  return {
    kind: "ready",
    bottomRef,
    contentRef,
    conversationId,
    editingContent,
    editingMessageId,
    hiddenMessageCount,
    lastAssistantMessageId,
    lastMessageId,
    locale,
    messageIndexById,
    messages,
    onApproveTool,
    onContinueAssistant,
    onForkMessage,
    onNavigateBranch,
    forkingMessageId,
    onDeleteMessage,
    onEditMessage,
    onJumpLatest,
    onRegenerateAssistant,
    onRejectTool,
    onResendMessage,
    onSuggestionClick,
    pendingApprovals,
    precedingUserByMessageId,
    savingMessageId,
    sending,
    setEditingContent,
    setEditingMessageId,
    setSavingMessageId,
    setVisibleMessageCount,
    t,
    userMessageShortcuts,
    viewportClassName,
    viewportRef,
    visibleMessages,
    workspaceArtifactDisplay,
    workspaceId,
  } as const;
}

export function ChatMessageList(
  ...args: Parameters<typeof useChatMessageListController>
) {
  const model = useChatMessageListController(...args);
  if (!("kind" in model)) return model;
  return <ChatMessageListView model={model} />;
}
