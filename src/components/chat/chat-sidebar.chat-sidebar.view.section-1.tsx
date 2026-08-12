import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
import { ChatSidebarBodySection1 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1";

export function ChatSidebarSection1({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {} = model;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatSidebarBodySection1 model={model} />
    </div>
  );
}
