import { RefreshCwIcon, SearchXIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
import { BUTTON_TYPE } from "./chat-sidebar.default-workspace-nav-open";
export function ChatSidebarListsBranch6({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const { onRetrySearch, t } = model;
  return (
    <Empty className="border-0 bg-transparent px-2 py-10">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="border-0 bg-transparent text-muted-foreground/40"
        >
          <SearchXIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-medium">
          {t("searchErrorTitle")}
        </EmptyTitle>
        <EmptyDescription className="text-xs text-muted-foreground/60">
          {t("searchErrorDescription")}
        </EmptyDescription>
      </EmptyHeader>
      {onRetrySearch ? (
        <Button
          type={BUTTON_TYPE}
          variant="outline"
          size="sm"
          className="min-h-10 rounded-xl"
          onClick={onRetrySearch}
        >
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          {t("retrySearch")}
        </Button>
      ) : null}
    </Empty>
  );
}
