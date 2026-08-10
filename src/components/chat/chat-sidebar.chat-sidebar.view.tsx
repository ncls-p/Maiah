import { PanelLeftCloseIcon } from "lucide-react";

import { SidebarFooter, SidebarHeader } from "@/components/sidebar-chrome";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { useChatSidebarController } from "./chat-sidebar.chat-sidebar";
import { ChatSidebarSection1 } from "./chat-sidebar.chat-sidebar.view.section-1";
import {
  BUTTON_TYPE,
  GHOST_VARIANT,
} from "./chat-sidebar.default-workspace-nav-open";

export type ChatSidebarViewModel = Extract<
  ReturnType<typeof useChatSidebarController>,
  { kind: "ready" }
>;
export function ChatSidebarView({ model }: { model: ChatSidebarViewModel }) {
  const { className, footerContent, onCollapsedChange, readOnly, shell, t } =
    model;
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-transparent text-sidebar-foreground",
        className,
      )}
    >
      <SidebarHeader
        contextLabel={t("conversations")}
        action={
          !readOnly && onCollapsedChange ? (
            <Button
              type={BUTTON_TYPE}
              size="icon-sm"
              variant={GHOST_VARIANT}
              className="size-10 shrink-0 rounded-xl text-muted-foreground transition-[background-color,color,scale] hover:bg-sidebar-accent/70 hover:text-sidebar-foreground active:scale-[0.96]"
              aria-label={t("collapseSidebar")}
              title={t("collapseSidebar")}
              onClick={() => onCollapsedChange(true)}
            >
              <PanelLeftCloseIcon className="size-4" aria-hidden="true" />
            </Button>
          ) : null
        }
      />

      <ChatSidebarSection1 model={model} />
      {footerContent ?? <SidebarFooter displayName={shell?.displayName} />}
    </div>
  );
}
