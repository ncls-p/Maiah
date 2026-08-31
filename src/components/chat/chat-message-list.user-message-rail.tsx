"use client";
import { ListTreeIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMessageScroller, useMessageScrollerVisibility } from "@/components/ui/message-scroller";
import { cn } from "@/lib/utils";
import { MESSAGE_JUMP_SCROLL_MARGIN, UserMessageShortcut, preferredScrollBehavior, rememberUserMessageAnchor } from "./chat-message-list.initial-visible-messages";

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


const RAIL_EXPANDED_CHAR_LIMIT = 420;
const RAIL_LONG_CHAR_THRESHOLD = 140;

function clipRailText(text: string, limit: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trimEnd()}…`;
}

export function UserMessageRailPanelBody({
  t,
  shortcuts,
  currentShortcutId,
  expandedShortcutId,
  onShortcutJump,
  onToggleExpand,
  onClose,
}: {
  t: ReturnType<typeof useTranslations<"chat.messageList">>;
  shortcuts: UserMessageShortcut[];
  currentShortcutId: string | null;
  expandedShortcutId: string | null;
  onShortcutJump: (shortcut: UserMessageShortcut) => void;
  onToggleExpand: (shortcutId: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-3 sm:px-2.5 sm:pb-1.5 sm:pt-1.5">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("userMessagesTitle")}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground/80 sm:hidden">
            {t("userMessagesHint")}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-[0.65rem] tabular-nums text-muted-foreground">
            {shortcuts.length}
          </span>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-xl text-muted-foreground outline-none transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 active:scale-[0.96] sm:hidden"
            aria-label={t("closeUserMessages")}
            onClick={onClose}
          >
            <XIcon className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="brand-divider shrink-0" aria-hidden="true" />
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 scrollbar-thin">
        {shortcuts.map((shortcut, index) => {
          const isCurrent = currentShortcutId === shortcut.id;
          const isExpanded = expandedShortcutId === shortcut.id;
          const normalizedLength = shortcut.fullText
            .replace(/\s+/g, " ")
            .trim().length;
          const isLong = normalizedLength > RAIL_LONG_CHAR_THRESHOLD;
          const displayText = isExpanded
            ? clipRailText(shortcut.fullText, RAIL_EXPANDED_CHAR_LIMIT)
            : shortcut.preview;
          const canExpandFurther =
            isExpanded && normalizedLength > RAIL_EXPANDED_CHAR_LIMIT;

          return (
            <div
              key={shortcut.id}
              className={cn(
                "group/rail-item relative rounded-xl transition-[background-color,box-shadow] duration-150",
                isCurrent || isExpanded
                  ? "bg-primary/[0.055] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_14%,transparent)]"
                  : "hover:bg-muted/70",
              )}
            >
              {index < shortcuts.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-[-0.35rem] left-[1.15rem] z-0 h-2 w-px bg-border/70"
                />
              ) : null}
              {isCurrent ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
                />
              ) : null}
              <button
                type="button"
                aria-current={isCurrent ? "location" : undefined}
                aria-label={t("jumpToUserMessage", {
                  count: shortcut.ordinal,
                  preview: shortcut.preview,
                })}
                className="relative z-[1] flex w-full items-start gap-2.5 px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-inset active:scale-[0.99]"
                onClick={() => onShortcutJump(shortcut)}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md font-mono text-[0.65rem] tabular-nums transition-[background-color,color] duration-150",
                    isCurrent
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground group-hover/rail-item:bg-background group-hover/rail-item:text-foreground",
                  )}
                  aria-hidden="true"
                >
                  {shortcut.ordinal}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[0.8rem] leading-5 text-pretty",
                      isExpanded
                        ? "max-h-28 overflow-y-auto whitespace-pre-wrap text-foreground scrollbar-thin"
                        : "line-clamp-2 text-muted-foreground group-hover/rail-item:text-foreground",
                      isCurrent && !isExpanded && "text-foreground",
                    )}
                  >
                    {displayText}
                  </span>
                  {canExpandFurther ? (
                    <span className="mt-1 block text-[0.65rem] text-muted-foreground">
                      {t("userMessageTruncated")}
                    </span>
                  ) : null}
                </span>
              </button>
              {isLong ? (
                <button
                  type="button"
                  className="relative z-[1] flex w-full items-center justify-center gap-1 border-t border-border/40 px-2 py-1.5 text-[0.65rem] font-medium text-muted-foreground outline-none transition-[background-color,color] duration-150 hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-inset"
                  aria-expanded={isExpanded}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleExpand(shortcut.id);
                  }}
                >
                  <ChevronDownIcon
                    className={cn(
                      "size-3 transition-transform duration-150",
                      isExpanded && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                  {isExpanded
                    ? t("collapseUserMessage")
                    : t("expandUserMessage")}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

