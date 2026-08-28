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
import {
  Message as MessagePrimitive,
  MessageContent as MessagePrimitiveContent,
  MessageFooter,
} from "@/components/ui/message";
import { MessageScrollerItem } from "@/components/ui/message-scroller";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { copyRichHtml } from "@/lib/rich-clipboard";
import { cn } from "@/lib/utils";
import type { ChatMessageListViewModel } from "./chat-message-list.chat-message-list.view";
import { EMPTY_PENDING_APPROVALS } from "./chat-message-list.initial-visible-messages";
import { MessageActionBar } from "./chat-message-list.message-action-bar";
import { ChatMessageMetricsTooltip } from "./chat-message-metrics-tooltip";

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
