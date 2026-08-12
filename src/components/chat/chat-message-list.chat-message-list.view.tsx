import {
  MessageContent,
  StreamingStatus,
} from "@/components/chat/chat-message-rendering";
import { shouldUseMessageScrollAnchor } from "@/components/chat/chat-scroll";
import {
  canContinueAssistantMessage,
  textFromMessage,
} from "@/components/chat/chat-types";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  MessageFooter,
  Message as MessagePrimitive,
  MessageContent as MessagePrimitiveContent,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { copyRichHtml } from "@/lib/rich-clipboard";
import { cn } from "@/lib/utils";
import type { useChatMessageListController } from "./chat-message-list.chat-message-list";
import { ChatScrollControls } from "./chat-message-list.chat-scroll-controls";
import { ChatMessageMetricsTooltip } from "./chat-message-metrics-tooltip";
import {
  BUTTON_TYPE,
  EMPTY_PENDING_APPROVALS,
  LOAD_MORE_MESSAGES,
  MessageVisibilityPersistence,
  OUTLINE_VARIANT,
  SavedMessageAnchorRestorer,
} from "./chat-message-list.initial-visible-messages";
import { MessageActionBar } from "./chat-message-list.message-action-bar";
import { UserMessageRail } from "./chat-message-list.user-message-rail";

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
            {visibleMessages.map((message) => {
              const content = textFromMessage(message);
              const isAssistant = message.role === "assistant";
              const isUser = message.role === "user";
              const hasFilePart = message.parts.some(
                (part) => part.type === "file",
              );
              const hasWorkPart = message.parts.some((part) =>
                ["reasoning", "tool-call", "tool-result"].includes(part.type),
              );
              const canEdit = Boolean(onEditMessage) && (isUser || isAssistant);
              const canDelete = Boolean(onDeleteMessage);
              const canRegenerate =
                Boolean(onRegenerateAssistant) &&
                isAssistant &&
                message.status !== "streaming";
              const canContinue =
                Boolean(onContinueAssistant) &&
                canContinueAssistantMessage(message, lastAssistantMessageId);
              const precedingUserMsg =
                precedingUserByMessageId.get(message.id) ?? null;
              const isEditing = editingMessageId === message.id;
              const isLast = message.id === lastMessageId;
              const isStreamingAssistant =
                isAssistant && message.status === "streaming";
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
                      "animate-in-up [contain-intrinsic-size:auto_10rem] [content-visibility:auto]",
                  )}
                  style={{ animationDelay: isLast ? "0s" : undefined }}
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
                        variant={
                          isEditing ? "ghost" : isUser ? "muted" : "ghost"
                        }
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
                            showSuggestions={
                              message.id === lastAssistantMessageId
                            }
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
                                    setEditingMessageId(null);
                                    setEditingContent("");
                                    setSavingMessageId(message.id);
                                    void (async () => {
                                      try {
                                        await onEditMessage?.(
                                          message,
                                          nextContent,
                                        );
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
                              {new Date(message.createdAt).toLocaleTimeString(
                                locale,
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </a>
                          ) : null}
                          {message.status === "streaming" ? (
                            <StreamingStatus />
                          ) : null}
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
                          sending={sending}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          canRegenerate={canRegenerate}
                          canContinue={canContinue}
                          canFork={
                            Boolean(onForkMessage) &&
                            isAssistant &&
                            message.status !== "streaming"
                          }
                          forking={forkingMessageId === message.id}
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
            })}
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
