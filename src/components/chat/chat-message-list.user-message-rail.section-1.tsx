import { ChevronDownIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { UserMessageShortcut } from "./chat-message-list.initial-visible-messages";

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
