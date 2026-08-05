"use client";

import { useLocale,useTranslations } from "next-intl";
import { useLayoutEffect,useMemo,useRef,useState } from "react";

import { MessageContent,StreamingStatus } from "@/components/chat/chat-message-rendering";
import { cancelsChatStreamFollow,getChatStreamFollowKey,isChatViewportAtEnd,shouldUseMessageScrollAnchor } from "@/components/chat/chat-scroll";
import { canContinueAssistantMessage,textFromMessage,type ChatMessage } from "@/components/chat/chat-types";
import { Bubble,BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker,MarkerContent } from "@/components/ui/marker";
import { MessageFooter,Message as MessagePrimitive,MessageContent as MessagePrimitiveContent } from "@/components/ui/message";
import { MessageScroller,MessageScrollerContent,MessageScrollerItem,MessageScrollerProvider,MessageScrollerViewport } from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { copyRichHtml } from "@/lib/rich-clipboard";
import { cn } from "@/lib/utils";
import { ChatScrollControls } from "./chat-message-list.chat-scroll-controls";
import { BUTTON_TYPE,ChatMessageListProps,EMPTY_PENDING_APPROVALS,INITIAL_VISIBLE_MESSAGES,LOAD_MORE_MESSAGES,MessageVisibilityPersistence,OUTLINE_VARIANT,SavedMessageAnchorRestorer,userMessageFullText,userMessagePreview } from "./chat-message-list.initial-visible-messages";
import { MessageActionBar } from "./chat-message-list.message-action-bar";
import { UserMessageRail } from "./chat-message-list.user-message-rail";

export function ChatMessageList({ messages, sending, loading, workspaceId, workspaceArtifactDisplay = "full", conversationId, bottomRef, onEditMessage, onDeleteMessage, onResendMessage, onRegenerateAssistant, onContinueAssistant, onJumpLatest, pendingApprovals = [], onApproveTool, onRejectTool, onSuggestionClick }: ChatMessageListProps) {
  const locale = useLocale();
  const t = useTranslations("chat.messageList");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [visibleMessageCount, setVisibleMessageCount] = useState(INITIAL_VISIBLE_MESSAGES);
  const hiddenMessageCount = Math.max(0, messages.length - visibleMessageCount);
  const visibleMessages = useMemo(() => (hiddenMessageCount > 0 ? messages.slice(hiddenMessageCount) : messages), [hiddenMessageCount, messages]);
  const messageIndexById = useMemo(() => new Map(messages.map((message, index) => [message.id, index])), [messages]);
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
  const scrollFollowKey = useMemo(() => getChatStreamFollowKey(messages), [messages]);

  // Follow every streamed layout change while the reader remains at the end.
  // Scrolling up opts out immediately and preserves the reader's position.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowStreamRef = useRef(false);
  const isDraggingScrollbarRef = useRef(false);

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

    const frame = window.requestAnimationFrame(() => {
      if (!shouldFollowStreamRef.current) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [scrollFollowKey, pendingApprovals.length]);

  useLayoutEffect(() => {
    if (!hasTranscript) return;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || typeof ResizeObserver === "undefined") return;

    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (!shouldFollowStreamRef.current) return;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (!shouldFollowStreamRef.current) return;
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
      });
    });
    observer.observe(content);

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
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

  const viewportClassName = workspaceArtifactDisplay === "summary" ? "px-2 py-3" : "px-3 py-4 sm:px-4 sm:py-8";

  return (
    <MessageScrollerProvider defaultScrollPosition="start" scrollMargin={24} scrollPreviousItemPeek={96}>
      <SavedMessageAnchorRestorer conversationId={conversationId} />
      <MessageVisibilityPersistence conversationId={conversationId} />
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport ref={viewportRef} preserveScrollOnPrepend className={viewportClassName} aria-label={t("transcript")}>
          <MessageScrollerContent ref={contentRef} className="mx-auto w-full max-w-4xl gap-5 pb-24">
            {hiddenMessageCount > 0 ? (
              <MessageScrollerItem className="flex justify-center">
                <Marker variant="separator" className="max-w-lg">
                  <MarkerContent>
                    <Button type={BUTTON_TYPE} variant={OUTLINE_VARIANT} size="sm" className="rounded-full text-xs text-muted-foreground" onClick={() => setVisibleMessageCount((count) => count + LOAD_MORE_MESSAGES)}>
                      {t("showOlder", {
                        count: Math.min(LOAD_MORE_MESSAGES, hiddenMessageCount),
                      })}
                    </Button>
                  </MarkerContent>
                </Marker>
              </MessageScrollerItem>
            ) : null}
            {visibleMessages.map((message) => {
              const content = textFromMessage(message);
              const isAssistant = message.role === "assistant";
              const isUser = message.role === "user";
              const hasFilePart = message.parts.some((part) => part.type === "file");
              const hasWorkPart = message.parts.some((part) => ["reasoning", "tool-call", "tool-result"].includes(part.type));
              const canEdit = Boolean(onEditMessage) && (isUser || isAssistant);
              const canDelete = Boolean(onDeleteMessage);
              const canRegenerate = Boolean(onRegenerateAssistant) && isAssistant && message.status !== "streaming";
              const canContinue = Boolean(onContinueAssistant) && canContinueAssistantMessage(message, lastAssistantMessageId);
              const precedingUserMsg = precedingUserByMessageId.get(message.id) ?? null;
              const isEditing = editingMessageId === message.id;
              const isLast = message.id === lastMessageId;
              const isStreamingAssistant = isAssistant && message.status === "streaming";
              const shouldScrollAnchor = shouldUseMessageScrollAnchor({
                message,
                sending,
              });
              const isAnimating = sending && isLast && isStreamingAssistant;
              const messagePendingApprovals = isStreamingAssistant ? pendingApprovals : EMPTY_PENDING_APPROVALS;
              const align = isUser ? "end" : "start";

              return (
                <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={shouldScrollAnchor} id={`message-${message.id}`} className="scroll-mt-6 animate-in-up" style={{ animationDelay: isLast ? "0s" : undefined }}>
                  <MessagePrimitive align={align}>
                    <MessagePrimitiveContent className={cn("transition-opacity duration-150", isUser && !hasFilePart ? "max-w-[82%]" : "max-w-[min(100%,48rem)]", isAssistant && hasWorkPart && "w-full", isLast && isAnimating && "animate-in-fade")}>
                      <Bubble align={align} variant={isUser ? "muted" : "ghost"} className={cn(isAssistant && hasWorkPart && "w-full", isEditing && "ring-2 ring-primary/25")}>
                        <BubbleContent className={cn("transition-[background-color,box-shadow,color] duration-150 ease-out", isAssistant && hasWorkPart && "w-full", isUser ? "msg-bubble--user" : "msg-bubble--assistant")}>
                          <MessageContent
                            message={message}
                            showSuggestions={message.id === lastAssistantMessageId}
                            isEditing={isEditing}
                            editingContent={isEditing ? editingContent : ""}
                            isSaving={savingMessageId === message.id}
                            isAnimating={isAnimating}
                            workspaceId={workspaceId}
                            workspaceArtifactDisplay={workspaceArtifactDisplay}
                            onEditingContentChange={isEditing ? setEditingContent : undefined}
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
                                ? async () => {
                                    setSavingMessageId(message.id);
                                    try {
                                      await onEditMessage?.(message, editingContent.trim());
                                      setEditingMessageId(null);
                                      setEditingContent("");
                                    } finally {
                                      setSavingMessageId(null);
                                    }
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

                      {message.createdAt ? (
                        <MessageFooter className="mt-1.5 gap-2 text-[11px] text-muted-foreground/60">
                          <a href={`#message-${message.id}`} className="rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" aria-label={t("directLink")}>
                            {new Date(message.createdAt).toLocaleTimeString(locale, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </a>
                          {message.status === "streaming" ? <StreamingStatus /> : null}
                        </MessageFooter>
                      ) : null}

                      <MessageActionBar
                        message={message}
                        sending={sending}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        canRegenerate={canRegenerate}
                        canContinue={canContinue}
                        onCopy={async () => {
                          await copyRichHtml(markdownToHtml(content));
                        }}
                        onEdit={() => {
                          setEditingMessageId(message.id);
                          setEditingContent(content);
                        }}
                        onDelete={() => void onDeleteMessage?.(message)}
                        onRegenerate={() => {
                          if (precedingUserMsg) {
                            void onResendMessage?.(precedingUserMsg);
                          }
                        }}
                        onContinue={() => {
                          void onContinueAssistant?.(message);
                        }}
                      />
                    </MessagePrimitiveContent>
                  </MessagePrimitive>
                </MessageScrollerItem>
              );
            })}
            <div ref={bottomRef} aria-hidden="true" />
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <UserMessageRail shortcuts={userMessageShortcuts} hiddenMessageCount={hiddenMessageCount} totalMessageCount={messages.length} conversationId={conversationId} messageIndexById={messageIndexById} setVisibleMessageCount={setVisibleMessageCount} />
        <ChatScrollControls sending={sending} conversationId={conversationId} onJumpLatest={onJumpLatest} />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
