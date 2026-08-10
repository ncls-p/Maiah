import { MessageSquareIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
export function ChatSidebarListsBranch2({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const { t } = model;
  return (
    <div className="pt-2">
      <Empty className="border-0 bg-transparent px-2 py-10">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="border-0 bg-transparent text-muted-foreground/40"
          >
            <MessageSquareIcon className="size-5" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-sm font-medium">
            {t("emptyTitle")}
          </EmptyTitle>
          <EmptyDescription className="text-xs text-muted-foreground/60">
            {t("emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
