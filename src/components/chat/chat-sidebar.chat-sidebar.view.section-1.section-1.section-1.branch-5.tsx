import { SearchXIcon } from "lucide-react";

import { Empty,EmptyDescription,EmptyHeader,EmptyMedia,EmptyTitle } from "@/components/ui/empty";
import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
export function ChatSidebarListsBranch5({ model }: { model: ChatSidebarViewModel }) {
  const { searchQuery, t } = model;
  return (
    <Empty className="border-0 bg-transparent px-2 py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="border-0 bg-transparent text-muted-foreground/40">
          <SearchXIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-medium">{t("noSearchResultsTitle")}</EmptyTitle>
        <EmptyDescription className="text-xs text-muted-foreground/60">
          {t("noSearchResultsDescription", {
            query: searchQuery.trim(),
          })}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
