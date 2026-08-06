import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
import { ChatSidebarListsBranch1 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1.section-1.branch-1";
import { ChatSidebarListsBranch2 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1.section-1.branch-2";
import { ChatSidebarListsBranch3 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1.section-1.branch-3";
import { ChatSidebarListsBranch4 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1.section-1.branch-4";
import { ChatSidebarListsBranch5 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1.section-1.branch-5";
import { ChatSidebarListsBranch6 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1.section-1.branch-6";
import { ChatSidebarListsBranch7 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1.section-1.branch-7";
import { ChatSidebarListsBranch8 } from "./chat-sidebar.chat-sidebar.view.section-1.section-1.section-1.branch-8";

export function ChatSidebarContentSection1({ model }: { model: ChatSidebarViewModel }) {
  const { conversationFolders, conversations, loading, searchActive, searchError, searchResults, searching } = model;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-3 pt-1">
      {!searchActive ? <ChatSidebarListsBranch8 model={model} /> : null}
      <div className="flex min-h-0 flex-col gap-1">{searchActive ? searching && searchResults.length === 0 ? <ChatSidebarListsBranch7 model={model} /> : searchError && searchResults.length === 0 ? <ChatSidebarListsBranch6 model={model} /> : searchResults.length === 0 ? <ChatSidebarListsBranch5 model={model} /> : <ChatSidebarListsBranch4 model={model} /> : loading ? <ChatSidebarListsBranch3 model={model} /> : conversations.length === 0 && conversationFolders.length === 0 ? <ChatSidebarListsBranch2 model={model} /> : <ChatSidebarListsBranch1 model={model} />}</div>
    </div>
  );
}
