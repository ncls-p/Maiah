"use client";
import { useLocale, useTranslations } from "next-intl";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { applyChatStreamFollowPin, cancelsChatStreamFollow, getChatStreamFollowKey, isChatViewportAtEnd, shouldUseMessageScrollAnchor } from "@/components/chat/chat-scroll";
import { type ChatMessage, canContinueAssistantMessage, textFromMessage } from "@/components/chat/chat-types";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatMessageListProps, INITIAL_VISIBLE_MESSAGES, userMessageFullText, userMessagePreview, BUTTON_TYPE, LOAD_MORE_MESSAGES, MessageVisibilityPersistence, OUTLINE_VARIANT, SavedMessageAnchorRestorer, EMPTY_PENDING_APPROVALS } from "./chat-message-list.initial-visible-messages";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { MessageScroller, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { ChatScrollControls } from "./chat-message-list.chat-scroll-controls";
import { UserMessageRail } from "./chat-message-list.user-message-rail";
import { MessageContent, StreamingStatus } from "@/components/chat/chat-message-rendering";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message as MessagePrimitive, MessageContent as MessagePrimitiveContent, MessageFooter } from "@/components/ui/message";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { copyRichHtml } from "@/lib/rich-clipboard";
import { cn } from "@/lib/utils";
import { MessageActionBar } from "./chat-message-list.message-action-bar";
import { ChatMessageMetricsTooltip } from "./chat-message-metrics-tooltip";

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
  const isStreamingReply = sending || lastMessage?.status === "streaming";

  useLayoutEffect(() => {
    shouldFollowStreamRef.current = true;
  }, [conversationId]);

  useLayoutEffect(() => {
    if (sending) shouldFollowStreamRef.current = true;
  }, [sending]);

  useLayoutEffect(() => {
    if (!hasTranscript) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateFollowStream = () => {
      shouldFollowStreamRef.current = isChatViewportAtEnd(viewport);
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

    updateFollowStream();
    viewport.addEventListener("scroll", updateFollowStream, { passive: true });
    viewport.addEventListener("wheel", handleWheel, { passive: true });
    viewport.addEventListener("touchmove", handleTouchMove, { passive: true });
    viewport.addEventListener("keydown", handleKeyDown);

    return () => {
      viewport.removeEventListener("scroll", updateFollowStream);
      viewport.removeEventListener("wheel", handleWheel);
      viewport.removeEventListener("touchmove", handleTouchMove);
      viewport.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasTranscript]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    shouldFollowStreamRef.current = applyChatStreamFollowPin(viewport, {
      following: shouldFollowStreamRef.current,
      streaming: isStreamingReply,
    });
  }, [scrollFollowKey, pendingApprovals.length, isStreamingReply]);

  useLayoutEffect(() => {
    if (!hasTranscript) return;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      shouldFollowStreamRef.current = applyChatStreamFollowPin(viewport, {
        following: shouldFollowStreamRef.current,
        streaming: isStreamingReply,
      });
    });
    observer.observe(content);

    return () => observer.disconnect();
  }, [hasTranscript, isStreamingReply]);

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


export type ChatMessageListViewModel = Extract<
  ReturnType<typeof useChatMessageListController>,
  { kind: "ready" }
>;
export function ChatMessageListView({
  model,
}: {
  model: ChatMessageListViewModel;
}) {
  const {
    bottomRef,
    contentRef,
    conversationId,
    hiddenMessageCount,
    messageIndexById,
    messages,
    onJumpLatest,
    sending,
    setVisibleMessageCount,
    t,
    userMessageShortcuts,
    visibleMessages,
    viewportClassName,
    viewportRef,
  } = model;
  return (
    <MessageScrollerProvider
      key={conversationId ?? "empty"}
      defaultScrollPosition="end"
      scrollMargin={24}
      scrollPreviousItemPeek={96}
    >
      <SavedMessageAnchorRestorer conversationId={conversationId} />
      <MessageVisibilityPersistence conversationId={conversationId} />
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport
          ref={viewportRef}
          preserveScrollOnPrepend
          className={viewportClassName}
          aria-label={t("transcript")}
        >
          <MessageScrollerContent
            ref={contentRef}
            className="mx-auto w-full max-w-4xl gap-5 pb-24"
          >
            {hiddenMessageCount > 0 ? (
              <MessageScrollerItem className="flex justify-center">
                <Marker variant="separator" className="max-w-lg">
                  <MarkerContent>
                    <Button
                      type={BUTTON_TYPE}
                      variant={OUTLINE_VARIANT}
                      size="sm"
                      className="rounded-full text-xs text-muted-foreground"
                      onClick={() =>
                        setVisibleMessageCount(
                          (count) => count + LOAD_MORE_MESSAGES,
                        )
                      }
                    >
                      {t("showOlder", {
                        count: Math.min(LOAD_MORE_MESSAGES, hiddenMessageCount),
                      })}
                    </Button>
                  </MarkerContent>
                </Marker>
              </MessageScrollerItem>
            ) : null}
            {visibleMessages.map((message) => (
              <ChatMessageListItem
                key={message.id}
                model={model}
                message={message}
              />
            ))}
            <div ref={bottomRef} aria-hidden="true" />
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <UserMessageRail
          shortcuts={userMessageShortcuts}
          hiddenMessageCount={hiddenMessageCount}
          totalMessageCount={messages.length}
          conversationId={conversationId}
          messageIndexById={messageIndexById}
          setVisibleMessageCount={setVisibleMessageCount}
        />
        <ChatScrollControls
          sending={sending}
          conversationId={conversationId}
          onJumpLatest={onJumpLatest}
        />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}


export function ChatMessageListItem({
  model,
  message,
}: {
  model: ChatMessageListViewModel;
  message: ChatMessageListViewModel["visibleMessages"][number];
}) {
  const {
    editingContent,
    editingMessageId,
    lastAssistantMessageId,
    lastMessageId,
    locale,
    onApproveTool,
    onContinueAssistant,
    onForkMessage,
    forkingMessageId,
    onDeleteMessage,
    onEditMessage,
    onNavigateBranch,
    onRegenerateAssistant,
    onRejectTool,
    onSuggestionClick,
    pendingApprovals,
    precedingUserByMessageId,
    savingMessageId,
    sending,
    setEditingContent,
    setEditingMessageId,
    setSavingMessageId,
    t,
    workspaceArtifactDisplay,
    workspaceId,
  } = model;
  const content = textFromMessage(message);
  const actionsBusy =
    sending ||
    model.messages.some(
      (message) =>
        message.status === "pending" || message.status === "streaming",
    );
  const isAssistant = message.role === "assistant";
  const isUser = message.role === "user";
  const hasFilePart = message.parts.some((part) => part.type === "file");
  const hasWorkPart = message.parts.some((part) =>
    ["reasoning", "tool-call", "tool-result"].includes(part.type),
  );
  const messageIsMutable =
    message.status !== "pending" && message.status !== "streaming";
  const canEdit =
    Boolean(onEditMessage) && messageIsMutable && (isUser || isAssistant);
  const canDelete =
    Boolean(onDeleteMessage) && messageIsMutable && !actionsBusy;
  const precedingUserMessage = precedingUserByMessageId.get(message.id) ?? null;
  const isTerminalAssistant =
    isAssistant &&
    (message.status === "completed" ||
      message.status === "failed" ||
      message.status === "cancelled");
  const canRegenerate =
    Boolean(onRegenerateAssistant) &&
    isTerminalAssistant &&
    Boolean(precedingUserMessage) &&
    textFromMessage(precedingUserMessage!).trim().length > 0;
  const canContinue =
    Boolean(onContinueAssistant) &&
    canContinueAssistantMessage(message, lastAssistantMessageId);
  const isEditing = editingMessageId === message.id;
  const isLast = message.id === lastMessageId;
  const isStreamingAssistant = isAssistant && message.status === "streaming";
  const shouldScrollAnchor = shouldUseMessageScrollAnchor({
    message,
    sending,
  });
  const isAnimating = sending && isLast && isStreamingAssistant;
  const messagePendingApprovals = isStreamingAssistant
    ? pendingApprovals
    : EMPTY_PENDING_APPROVALS;
  const align = isUser ? "end" : "start";

  return (
    <MessageScrollerItem
      key={message.id}
      messageId={message.id}
      scrollAnchor={shouldScrollAnchor}
      id={`message-${message.id}`}
      className={cn(
        "scroll-mt-6",
        !isStreamingAssistant &&
          !isLast &&
          "animate-in-up [contain-intrinsic-size:auto_10rem] [content-visibility:auto]",
      )}
    >
      <MessagePrimitive align={align}>
        <MessagePrimitiveContent
          className={cn(
            "transition-opacity duration-150",
            isUser && !hasFilePart && !isEditing
              ? "max-w-[82%]"
              : "max-w-[min(100%,48rem)]",
            isEditing && "max-w-[min(100%,36rem)]",
            isAssistant && hasWorkPart && "w-full",
          )}
        >
          <Bubble
            align={align}
            variant={isEditing ? "ghost" : isUser ? "muted" : "ghost"}
            className={cn(
              isAssistant && hasWorkPart && "w-full",
              isEditing && "max-w-[min(100%,36rem)]",
            )}
          >
            <BubbleContent
              className={cn(
                "transition-[background-color,box-shadow,color] duration-150 ease-out",
                isAssistant && hasWorkPart && "w-full",
                isEditing
                  ? "w-full max-w-full overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none"
                  : isUser
                    ? "msg-bubble--user"
                    : "msg-bubble--assistant",
              )}
            >
              <MessageContent
                message={message}
                showSuggestions={message.id === lastAssistantMessageId}
                isEditing={isEditing}
                editingContent={isEditing ? editingContent : ""}
                isSaving={savingMessageId === message.id}
                isAnimating={isAnimating}
                workspaceId={workspaceId}
                workspaceArtifactDisplay={workspaceArtifactDisplay}
                onEditingContentChange={
                  isEditing ? setEditingContent : undefined
                }
                onCancelEdit={
                  isEditing
                    ? () => {
                        setEditingMessageId(null);
                        setEditingContent("");
                      }
                    : undefined
                }
                onSaveEdit={
                  isEditing
                    ? () => {
                        const nextContent = editingContent.trim();
                        setSavingMessageId(message.id);
                        void (async () => {
                          try {
                            const saved = await onEditMessage?.(
                              message,
                              nextContent,
                            );
                            if (saved !== false) {
                              setEditingMessageId(null);
                              setEditingContent("");
                            }
                          } finally {
                            setSavingMessageId(null);
                          }
                        })();
                      }
                    : undefined
                }
                pendingApprovals={messagePendingApprovals}
                onApproveTool={onApproveTool}
                onRejectTool={onRejectTool}
                onSuggestionClick={onSuggestionClick}
              />
            </BubbleContent>
          </Bubble>

          {!isEditing && (message.createdAt || message.metrics) ? (
            <MessageFooter className="mt-1.5 gap-2 text-[11px] text-muted-foreground/60">
              {message.createdAt ? (
                <a
                  href={`#message-${message.id}`}
                  className="rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  aria-label={t("directLink")}
                >
                  {new Date(message.createdAt).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </a>
              ) : null}
              {message.status === "streaming" ? <StreamingStatus /> : null}
              {isAssistant && message.metrics ? (
                <ChatMessageMetricsTooltip
                  metrics={message.metrics}
                  locale={locale}
                />
              ) : null}
            </MessageFooter>
          ) : null}

          {!isEditing ? (
            <MessageActionBar
              message={message}
              sending={actionsBusy}
              canEdit={canEdit}
              canDelete={canDelete}
              canRegenerate={canRegenerate}
              canContinue={canContinue}
              canFork={Boolean(onForkMessage) && isTerminalAssistant}
              forking={forkingMessageId === message.id}
              onCopy={async () => {
                await copyRichHtml(markdownToHtml(content));
              }}
              onEdit={() => {
                setEditingMessageId(message.id);
                setEditingContent(content);
              }}
              onDelete={() => onDeleteMessage?.(message)}
              onRegenerate={() => {
                void onRegenerateAssistant?.(message);
              }}
              onContinue={() => {
                void onContinueAssistant?.(message);
              }}
              onFork={() => void onForkMessage?.(message)}
              onNavigateBranch={(conversationId) =>
                void onNavigateBranch?.(conversationId)
              }
            />
          ) : null}
        </MessagePrimitiveContent>
      </MessagePrimitive>
    </MessageScrollerItem>
  );
}

