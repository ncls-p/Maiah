import { ChatAppNavigation } from "./chat-sidebar.chat-app-navigation";
import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
import { ChatSidebarContentSection1 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1.section-1";
import { ChatSidebarContentSection2 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1.section-2";

export function ChatSidebarBodySection1({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const { navGroups, showWorkspaceNavigation } = model;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatSidebarContentSection2 model={model} />

      <ChatSidebarContentSection1 model={model} />

      {showWorkspaceNavigation && navGroups.length > 0 ? (
        <ChatAppNavigation groups={navGroups} />
      ) : null}
    </div>
  );
}
