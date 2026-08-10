import {
  CheckIcon,
  MessageSquarePlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
import { TemporaryConversationButton } from "./temporary-conversation-button";
import {
  BUTTON_TYPE,
  GHOST_VARIANT,
} from "./chat-sidebar.default-workspace-nav-open";
export function ChatSidebarContentSection2({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {
    creatingFolder,
    newFolderName,
    onNewConversation,
    onNewTemporaryConversation,
    onSearchQueryChange,
    readOnly,
    saveNewFolder,
    searchActive,
    searchError,
    searchQuery,
    searchResults,
    searching,
    setCreatingFolder,
    setNewFolderName,
    t,
  } = model;
  return (
    <div className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-3">
      <div className="flex items-center gap-2">
        {onNewTemporaryConversation ? (
          <TemporaryConversationButton onSelect={onNewTemporaryConversation} />
        ) : null}
        <Button
          type={BUTTON_TYPE}
          onClick={onNewConversation}
          className="h-11 min-w-0 flex-1 justify-start gap-2.5 rounded-xl px-3.5 text-sm shadow-[0_8px_22px_-16px_color-mix(in_oklch,var(--primary)_70%,transparent)]"
          aria-label={t("newConversation")}
        >
          <MessageSquarePlusIcon
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">{t("newConversation")}</span>
        </Button>
      </div>

      <div className="relative flex items-center">
        <SearchIcon
          className="pointer-events-none absolute left-3 size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          name="conversation-search"
          autoComplete="off"
          aria-label={t("searchLabel")}
          placeholder={
            readOnly ? t("searchCompactPlaceholder") : t("searchPlaceholder")
          }
          value={searchQuery}
          onChange={(event) => onSearchQueryChange?.(event.target.value)}
          className={cn(
            "h-11 min-w-0 rounded-xl border-sidebar-border/60 bg-card/60 pl-9 text-xs shadow-none",
            searchActive ? "pr-11" : "pr-3",
          )}
        />
        {searchActive ? (
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            className="absolute right-0.5 size-10 shrink-0 rounded-[10px]"
            aria-label={t("clearSearch")}
            onClick={() => onSearchQueryChange?.("")}
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {searchActive && !searching && !searchError
          ? t("searchResultCount", { count: searchResults.length })
          : null}
      </p>

      {!readOnly && creatingFolder ? (
        <div className="flex items-center gap-1 rounded-xl border border-sidebar-border/60 bg-background p-1">
          <Input
            aria-label={t("folderName")}
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveNewFolder();
              if (event.key === "Escape") setCreatingFolder(false);
            }}
            placeholder={t("folderName")}
            className="h-10 min-w-0 rounded-lg px-3 text-xs"
            autoFocus
          />
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            aria-label={t("createFolder")}
            className="size-10 shrink-0 rounded-xl"
            onClick={saveNewFolder}
          >
            <CheckIcon className="size-3" aria-hidden="true" />
          </Button>
          <Button
            type={BUTTON_TYPE}
            size="icon-sm"
            variant={GHOST_VARIANT}
            aria-label={t("cancelFolderCreation")}
            className="size-10 shrink-0 rounded-xl"
            onClick={() => setCreatingFolder(false)}
          >
            <XIcon className="size-3" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
