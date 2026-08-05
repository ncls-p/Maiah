"use client";
import type {
ChatConversation
} from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuGroup,
DropdownMenuItem,
DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
ArrowDownIcon,
ArrowUpIcon,
CheckIcon,
MoreHorizontalIcon,
PencilIcon,
PinIcon,
Trash2Icon,
XIcon
} from "lucide-react";
import { useLocale,useTranslations } from "next-intl";
import { BUTTON_TYPE,GHOST_VARIANT,formatRelativeTime } from "./chat-sidebar.default-workspace-nav-open";
export function ConversationItem({
  conversation,
  isActive,
  isEditing,
  editingTitle,
  agentName,
  onSelect,
  onRename,
  onDelete,
  onEditStart,
  onEditChange,
  onEditCancel,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onDragEnd,
  onDropBefore,
  isDragging,
  searchMatch,
  readOnly,
}: {
  conversation: ChatConversation;
  isActive: boolean;
  isEditing: boolean;
  editingTitle: string;
  agentName: string;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onEditStart: () => void;
  onEditChange: (title: string) => void;
  onEditCancel: () => void;
  onTogglePin: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDropBefore: (event: React.DragEvent<HTMLDivElement>) => void;
  isDragging: boolean;
  searchMatch?: ChatConversation["searchMatch"];
  readOnly?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("chat.sidebar");
  const pinned = Boolean(conversation.pinnedAt);
  return (
    <div
      draggable={!readOnly && !isEditing && !searchMatch}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropBefore}
      className={cn(
        "group/conversation relative overflow-hidden rounded-xl border border-transparent transition-[background-color,border-color,opacity]",
        isActive
          ? "border-sidebar-border/35 bg-card/70 text-sidebar-accent-foreground shadow-[0_10px_28px_-24px_color-mix(in_oklch,var(--foreground)_35%,transparent)]"
          : "hover:bg-muted/70",
        isDragging && "opacity-45",
      )}
    >
      {isEditing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1 p-1.5">
          <Input
            aria-label={t("conversationTitle")}
            value={editingTitle}
            onChange={(event) => onEditChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const nextTitle = editingTitle.trim();
                if (nextTitle) {
                  onRename(nextTitle);
                }
              }
              if (event.key === "Escape") {
                onEditCancel();
              }
            }}
            className="h-10 min-w-0 rounded-xl px-3 text-xs"
            autoFocus
          />
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            aria-label={t("saveTitle")}
            className="size-10 shrink-0 rounded-xl"
            onClick={() => {
              const nextTitle = editingTitle.trim();
              if (!nextTitle) return;
              onRename(nextTitle);
            }}
          >
            <CheckIcon className="size-3" aria-hidden="true" />
          </Button>
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            aria-label={t("cancelTitleEdit")}
            className="size-10 shrink-0 rounded-xl"
            onClick={onEditCancel}
          >
            <XIcon className="size-3" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="flex min-h-12 items-center gap-1 px-2 py-1">
          <i
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              isActive ? "bg-primary" : "bg-muted-foreground/45",
            )}
            aria-hidden="true"
          />
          <button
            type={BUTTON_TYPE}
            onClick={onSelect}
            className="min-h-10 min-w-0 flex-1 rounded-lg px-1.5 text-left outline-none transition-[color] focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span
              className={cn(
                "block truncate text-[12px] leading-tight transition-[color]",
                isActive ? "font-semibold text-foreground" : "font-medium",
              )}
            >
              {conversation.title}
            </span>
            {searchMatch ? (
              <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                <span className="font-medium">
                  {searchMatch.kind === "message"
                    ? t("messageMatch")
                    : t("titleMatch")}
                </span>
                {searchMatch.kind === "message"
                  ? ` · “${searchMatch.snippet}”`
                  : null}
              </span>
            ) : null}
            <span className="mt-1 flex items-center gap-1 text-[10px] leading-none text-muted-foreground/70">
              <span className="truncate">{agentName}</span>
              <span className="shrink-0 text-muted-foreground/25">·</span>
              <span className="shrink-0">
                {formatRelativeTime(conversation.updatedAt, locale, t)}
              </span>
            </span>
          </button>
          {pinned && !searchMatch ? (
            <PinIcon
              className="size-3 shrink-0 text-primary"
              aria-hidden="true"
            />
          ) : null}
          {!readOnly && !searchMatch ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type={BUTTON_TYPE}
                  size="icon-sm"
                  variant={GHOST_VARIANT}
                  aria-label={t("conversationActions")}
                  className={cn(
                    "size-10 shrink-0 rounded-xl transition-[background-color,opacity] hover:bg-background/80 md:opacity-0 md:group-hover/conversation:opacity-100 md:group-focus-within/conversation:opacity-100 data-[state=open]:opacity-100",
                    isActive && "opacity-100",
                  )}
                >
                  <MoreHorizontalIcon className="size-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={onTogglePin}
                    className="min-h-10 gap-2"
                  >
                    <PinIcon className="size-3.5" aria-hidden="true" />
                    {pinned ? t("unpin") : t("pinToTop")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={onMoveUp}
                    disabled={!canMoveUp}
                    className="min-h-10 gap-2"
                  >
                    <ArrowUpIcon className="size-3.5" aria-hidden="true" />
                    {t("moveUp")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={onMoveDown}
                    disabled={!canMoveDown}
                    className="min-h-10 gap-2"
                  >
                    <ArrowDownIcon className="size-3.5" aria-hidden="true" />
                    {t("moveDown")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => window.requestAnimationFrame(onEditStart)}
                    className="min-h-10 gap-2"
                  >
                    <PencilIcon className="size-3.5" aria-hidden="true" />
                    {t("rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={onDelete}
                    className="min-h-10 gap-2"
                  >
                    <Trash2Icon className="size-3.5" aria-hidden="true" />
                    {t("delete")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      )}
    </div>
  );
}
