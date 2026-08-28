import { Button } from "@/components/ui/button";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { useChatMessageListController } from "./chat-message-list.chat-message-list";
import { ChatScrollControls } from "./chat-message-list.chat-scroll-controls";
import {
  BUTTON_TYPE,
  LOAD_MORE_MESSAGES,
  MessageVisibilityPersistence,
  OUTLINE_VARIANT,
  SavedMessageAnchorRestorer,
} from "./chat-message-list.initial-visible-messages";
import { ChatMessageListItem } from "./chat-message-list.chat-message-list.view.section-1";
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
