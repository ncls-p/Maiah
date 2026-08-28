"use client";

import { ListTreeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type * as React from "react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import { cn } from "@/lib/utils";
import {
  MESSAGE_JUMP_SCROLL_MARGIN,
  UserMessageShortcut,
  preferredScrollBehavior,
  rememberUserMessageAnchor,
} from "./chat-message-list.initial-visible-messages";
import { UserMessageRailPanelBody } from "./chat-message-list.user-message-rail.section-1";

function canHoverOpenPanel() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

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
  const [expandedShortcutId, setExpandedShortcutId] = useState<string | null>(
    null,
  );
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

  useEffect(() => {
    if (!isPanelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPanelOpen(false);
        setExpandedShortcutId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPanelOpen]);

  if (shortcuts.length === 0) return null;

  const jumpToShortcut = (shortcut: UserMessageShortcut) => {
    const requiredVisibleCount = totalMessageCount - shortcut.messageIndex;
    setIsPanelOpen(false);
    setExpandedShortcutId(null);
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
    setExpandedShortcutId(null);
  };

  return (
    <>
      {typeof document !== "undefined" && isPanelOpen
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-background/45 sm:hidden"
                onClick={closePanel}
              />
              <div
                className="fixed inset-x-3 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.75rem))] z-40 flex max-h-[min(70dvh,32rem)] min-h-0 flex-col overflow-hidden rounded-[1.35rem] border border-transparent bg-popover text-popover-foreground shadow-[var(--floating-shadow)] origin-bottom animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-3 duration-150 motion-reduce:animate-none sm:hidden"
                onWheelCapture={(event) => event.stopPropagation()}
              >
                <UserMessageRailPanelBody
                  t={t}
                  shortcuts={shortcuts}
                  currentShortcutId={currentShortcutId}
                  expandedShortcutId={expandedShortcutId}
                  onShortcutJump={jumpToShortcut}
                  onToggleExpand={(shortcutId) =>
                    setExpandedShortcutId((current) =>
                      current === shortcutId ? null : shortcutId,
                    )
                  }
                  onClose={closePanel}
                />
              </div>
            </>,
            document.body,
          )
        : null}

      <nav
        aria-label={t("userMessageShortcuts")}
        className={cn(
          "absolute z-30 flex items-end gap-2 sm:items-center",
          "right-2 bottom-[max(5.75rem,calc(env(safe-area-inset-bottom)+5rem))] sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2",
        )}
        onMouseEnter={() => {
          if (canHoverOpenPanel()) setIsPanelOpen(true);
        }}
        onMouseLeave={() => {
          if (canHoverOpenPanel()) closePanel();
        }}
        onBlur={(event) => {
          const nextFocusedElement = event.relatedTarget as Node | null;
          if (
            !nextFocusedElement ||
            !event.currentTarget.contains(nextFocusedElement)
          ) {
            if (canHoverOpenPanel()) closePanel();
          }
        }}
      >
        {isPanelOpen ? (
          <div
            className="hidden max-h-[min(42vh,22rem)] w-[min(18.5rem,calc(100vw-5.5rem))] origin-right animate-in fade-in-0 zoom-in-95 slide-in-from-right-2 flex-col overflow-hidden rounded-2xl border border-transparent bg-popover text-popover-foreground shadow-[var(--floating-shadow)] duration-150 motion-reduce:animate-none sm:flex"
            onWheelCapture={(event) => event.stopPropagation()}
          >
            <UserMessageRailPanelBody
              t={t}
              shortcuts={shortcuts}
              currentShortcutId={currentShortcutId}
              expandedShortcutId={expandedShortcutId}
              onShortcutJump={jumpToShortcut}
              onToggleExpand={(shortcutId) =>
                setExpandedShortcutId((current) =>
                  current === shortcutId ? null : shortcutId,
                )
              }
              onClose={closePanel}
            />
          </div>
        ) : null}
        <button
          type="button"
          aria-expanded={isPanelOpen}
          aria-label={t("showUserMessages", { count: shortcuts.length })}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card/96 text-muted-foreground outline-none transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 active:scale-[0.96] sm:size-8",
            isPanelOpen
              ? "border-primary/25 bg-primary/[0.06] text-primary shadow-[var(--control-shadow)]"
              : "shadow-[var(--control-shadow)] hover:shadow-[var(--control-shadow-hover)]",
          )}
          onFocus={() => {
            if (canHoverOpenPanel()) setIsPanelOpen(true);
          }}
          onClick={() =>
            setIsPanelOpen((open) => {
              if (open) setExpandedShortcutId(null);
              return !open;
            })
          }
        >
          <ListTreeIcon className="size-3.5" aria-hidden="true" />
        </button>
      </nav>
    </>
  );
}
