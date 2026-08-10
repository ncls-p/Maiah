import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
import {
  BUTTON_TYPE,
  GHOST_VARIANT,
} from "./chat-sidebar.default-workspace-nav-open";
export function ChatSidebarListsBranch4({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {
    hasMoreSearchResults,
    loadingMoreSearchResults,
    onLoadMoreSearchResults,
    onRetrySearch,
    renderConversation,
    searchError,
    searchResults,
    t,
  } = model;
  return (
    <div className="flex flex-col gap-1">
      <div className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
        {t("searchResultCount", { count: searchResults.length })}
      </div>
      {searchResults.map((conversation) =>
        renderConversation(conversation, { searchResult: true }),
      )}
      {searchError && onRetrySearch ? (
        <Button
          type={BUTTON_TYPE}
          variant="ghost"
          size="sm"
          className="min-h-10 rounded-xl text-xs text-muted-foreground"
          onClick={onRetrySearch}
        >
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          {t("retrySearch")}
        </Button>
      ) : null}
      {hasMoreSearchResults && onLoadMoreSearchResults ? (
        <Button
          type={BUTTON_TYPE}
          variant={GHOST_VARIANT}
          size="sm"
          className="mt-1 min-h-10 rounded-xl text-xs text-muted-foreground"
          disabled={loadingMoreSearchResults}
          onClick={onLoadMoreSearchResults}
        >
          {loadingMoreSearchResults ? t("loading") : t("loadMoreResults")}
        </Button>
      ) : null}
    </div>
  );
}
