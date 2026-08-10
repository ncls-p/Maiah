import { Skeleton } from "@/components/ui/skeleton";
import type { ChatSidebarViewModel } from "./chat-sidebar.chat-sidebar.view";
export function ChatSidebarListsBranch7({
  model,
}: {
  model: ChatSidebarViewModel;
}) {
  const {} = model;
  return (
    <div className="flex flex-col gap-px pt-px" aria-busy="true">
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}
