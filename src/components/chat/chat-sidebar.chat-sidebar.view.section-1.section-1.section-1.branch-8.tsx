import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
export function ChatSidebarListsBranch8({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const { renderHistoryActions, t } = model;
  return (
    <div className="flex min-h-10 items-center justify-between gap-2 px-2">
      <span className="min-w-0 truncate font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
        {t("recent")}
      </span>
      {renderHistoryActions()}
    </div>
  );
}
