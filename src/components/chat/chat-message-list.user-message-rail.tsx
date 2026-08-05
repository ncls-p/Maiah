"use client";

import { useTranslations } from "next-intl";
import type * as React from "react";
import { useLayoutEffect,useMemo,useState } from "react";

import {
useMessageScroller,
useMessageScrollerVisibility
} from "@/components/ui/message-scroller";
import { cn } from "@/lib/utils";
import { MESSAGE_JUMP_SCROLL_MARGIN,UserMessageShortcut,preferredScrollBehavior,rememberUserMessageAnchor } from "./chat-message-list.initial-visible-messages";


export function UserMessageRail({
  shortcuts,
  hiddenMessageCount,
  totalMessageCount,
  conversationId,
  messageIndexById,
  setVisibleMessageCount,
}: {
  shortcuts: UserMessageShortcut[];
  hiddenMessageCount: number;
  totalMessageCount: number;
  conversationId?: string | null;
  messageIndexById: ReadonlyMap<string, number>;
  setVisibleMessageCount: React.Dispatch<React.SetStateAction<number>>;
}) {
  const t = useTranslations("chat.messageList");
  const { scrollToMessage } = useMessageScroller();
  const { currentAnchorId } = useMessageScrollerVisibility();
  const [activeShortcutId, setActiveShortcutId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const currentShortcutId = useMemo(() => {
    if (!currentAnchorId) return null;
    const currentAnchorIndex = messageIndexById.get(currentAnchorId);
    if (currentAnchorIndex === undefined) return null;

    let nearestUserShortcutId: string | null = null;
    for (const shortcut of shortcuts) {
      if (shortcut.messageIndex > currentAnchorIndex) break;
      nearestUserShortcutId = shortcut.id;
    }

    return nearestUserShortcutId;
  }, [currentAnchorId, messageIndexById, shortcuts]);

  useLayoutEffect(() => {
    if (!pendingMessageId) return;

    const pendingShortcut = shortcuts.find(
      (shortcut) => shortcut.id === pendingMessageId,
    );
    if (!pendingShortcut) return;
    if (pendingShortcut.messageIndex < hiddenMessageCount) return;

    const frame = window.requestAnimationFrame(() => {
      scrollToMessage(pendingMessageId, {
        align: "start",
        behavior: preferredScrollBehavior(),
        scrollMargin: MESSAGE_JUMP_SCROLL_MARGIN,
      });
      rememberUserMessageAnchor(conversationId, pendingMessageId);
      setPendingMessageId(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    conversationId,
    hiddenMessageCount,
    pendingMessageId,
    scrollToMessage,
    shortcuts,
  ]);

  if (shortcuts.length === 0) return null;

  const jumpToShortcut = (shortcut: UserMessageShortcut) => {
    const requiredVisibleCount = totalMessageCount - shortcut.messageIndex;
    if (shortcut.messageIndex < hiddenMessageCount) {
      setPendingMessageId(shortcut.id);
      setVisibleMessageCount((count) => Math.max(count, requiredVisibleCount));
      return;
    }

    scrollToMessage(shortcut.id, {
      align: "start",
      behavior: preferredScrollBehavior(),
      scrollMargin: MESSAGE_JUMP_SCROLL_MARGIN,
    });
    rememberUserMessageAnchor(conversationId, shortcut.id);
  };

  const closePanel = () => {
    setIsPanelOpen(false);
    setActiveShortcutId(null);
  };

  return (
    <nav
      aria-label={t("userMessageShortcuts")}
      className="absolute right-1 top-1/2 z-30 hidden -translate-y-1/2 items-center gap-1.5 sm:flex"
      onMouseEnter={() => setIsPanelOpen(true)}
      onMouseLeave={closePanel}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget as Node | null;
        if (
          !nextFocusedElement ||
          !event.currentTarget.contains(nextFocusedElement)
        ) {
          closePanel();
        }
      }}
    >
      {isPanelOpen ? (
        <div
          className="w-60 max-w-[calc(100vw-4rem)] rounded-xl bg-popover/95 p-1 text-left text-popover-foreground shadow-[0_10px_26px_rgba(15,23,42,0.12)] ring-1 ring-border/55 backdrop-blur-md transition-[opacity,transform] duration-150 ease-out"
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <div className="flex max-h-[42vh] min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain pr-1 scrollbar-thin">
            {shortcuts.map((shortcut) => {
              const isCurrent = currentShortcutId === shortcut.id;
              const isActive = activeShortcutId === shortcut.id;
              return (
                <button
                  key={shortcut.id}
                  type="button"
                  aria-current={isCurrent ? "location" : undefined}
                  aria-label={t("jumpToUserMessage", {
                    count: shortcut.ordinal,
                    preview: shortcut.preview,
                  })}
                  className={cn(
                    "rounded-lg px-2 py-1 text-left outline-none transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/35 active:scale-[0.96]",
                    (isActive || isCurrent) &&
                      "bg-muted shadow-[0_6px_14px_rgba(15,23,42,0.07)]",
                  )}
                  onMouseEnter={() => setActiveShortcutId(shortcut.id)}
                  onFocus={() => {
                    setIsPanelOpen(true);
                    setActiveShortcutId(shortcut.id);
                  }}
                  onClick={() => jumpToShortcut(shortcut)}
                >
                  <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t("messageNumber", { count: shortcut.ordinal })}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[11px] leading-4 text-foreground transition-[color] duration-150",
                      isActive
                        ? "whitespace-pre-wrap"
                        : "line-clamp-1 text-muted-foreground",
                    )}
                  >
                    {isActive ? shortcut.fullText : shortcut.preview}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={isPanelOpen}
        aria-label={t("showUserMessages", { count: shortcuts.length })}
        className="flex flex-col items-center gap-0.5 rounded-full bg-background/50 px-1.5 py-1.5 shadow-[0_8px_22px_rgba(15,23,42,0.08)] outline-none ring-1 ring-border/45 backdrop-blur-md transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-background/80 focus-visible:ring-2 focus-visible:ring-ring/35 active:scale-[0.96]"
        onFocus={() => setIsPanelOpen(true)}
        onClick={() => setIsPanelOpen((open) => !open)}
      >
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            aria-hidden="true"
            className="size-1 rounded-full bg-neutral-950/75 shadow-sm ring-1 ring-background/80 dark:bg-neutral-50/75"
          />
        ))}
      </button>
    </nav>
  );
}
