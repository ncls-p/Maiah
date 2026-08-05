import { MessageSquarePlusIcon,PanelLeftOpenIcon,Settings2Icon } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { OrbitAccountMenu,OrbitProductNavigation,OrbitWordmark } from "@/components/orbit-product-navigation";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { APP_SIDEBAR_SURFACE_CLASS } from "@/components/sidebar-chrome";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Sheet,SheetContent,SheetHeader,SheetTitle,SheetTrigger } from "@/components/ui/sheet";
import { MAX_APP_SIDEBAR_WIDTH,MIN_APP_SIDEBAR_WIDTH } from "@/lib/sidebar-layout";
import { cn } from "@/lib/utils";
import { ChatComposerControlsContext } from "./chat-layout.chat-composer-controls-context";
import type { useChatLayoutController } from "./chat-layout.chat-layout";

type Model = Extract<ReturnType<typeof useChatLayoutController>, { kind: "ready" }>;
export function ChatLayoutView({ model }: { model: Model }) {
  const { adjustSidebarWidth, agentSelector, canChat, canRunSetup, children, desktopSidebarProps, mobileSidebarOpen, mobileSidebarProps, onNewConversation, onSetupComplete, resizingSidebar, selectedAgentId, setMobileSidebarOpen, setSetupOpen, setupOpen, shell, sidebarOpen, sidebarWidth, startSidebarResize, t, updateSidebarOpen } = model;
  return (
    <ChatComposerControlsContext.Provider value={agentSelector}>
      <div className="chat-shell-brand flex h-full min-h-0 overflow-hidden">
        <div
          data-slot="workspace-history-sidebar"
          className={cn("hidden ease-[cubic-bezier(0.2,0,0,1)] md:block", !resizingSidebar && "transition-[opacity,width] duration-200")}
          style={{
            width: sidebarOpen ? `${sidebarWidth}px` : 0,
            opacity: sidebarOpen ? 1 : 0,
          }}
        >
          {sidebarOpen && (
            <aside className={cn("relative h-full w-full border-r", APP_SIDEBAR_SURFACE_CLASS)}>
              <ChatSidebar {...desktopSidebarProps} className="w-full" />
              <div
                role="separator"
                aria-label={t("resizeConversations")}
                aria-orientation="vertical"
                aria-valuemin={MIN_APP_SIDEBAR_WIDTH}
                aria-valuemax={MAX_APP_SIDEBAR_WIDTH}
                aria-valuenow={sidebarWidth}
                tabIndex={0}
                className="group absolute inset-y-0 right-0 z-20 w-4 translate-x-2 cursor-col-resize outline-none"
                onPointerDown={startSidebarResize}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") adjustSidebarWidth(-12);
                  if (event.key === "ArrowRight") adjustSidebarWidth(12);
                }}
              >
                <div className="mx-auto h-full w-px bg-transparent transition-[background-color] group-hover:bg-border group-focus-visible:bg-ring" />
              </div>
            </aside>
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <AppHeader
            className="relative z-30 border-border/60 bg-background px-2 sm:px-4"
            leading={
              <>
                {!sidebarOpen ? (
                  <Button type="button" variant="ghost" size="icon" className="hidden size-10 rounded-xl md:inline-flex" aria-label={t("openConversations")} onClick={() => updateSidebarOpen({ open: true })}>
                    <PanelLeftOpenIcon className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
                <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                  <SheetTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="size-10 rounded-xl md:hidden" aria-label={t("openConversations")}>
                      <PanelLeftOpenIcon className="size-4" aria-hidden="true" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[min(100vw-2rem,22rem)] p-0">
                    <SheetHeader className="sr-only">
                      <SheetTitle>{t("conversations")}</SheetTitle>
                    </SheetHeader>
                    <ChatSidebar {...mobileSidebarProps} />
                  </SheetContent>
                </Sheet>
                <OrbitWordmark section={t("title")} />
              </>
            }
            center={<OrbitProductNavigation shell={shell} />}
            actions={
              <div className="flex items-center gap-1">
                {!sidebarOpen ? (
                  <Button type="button" size="sm" variant="outline" className="hidden min-h-10 gap-1.5 rounded-xl border-border/60 px-3 text-xs font-medium sm:inline-flex" aria-label={t("newConversation")} onClick={onNewConversation}>
                    <MessageSquarePlusIcon className="size-3.5" aria-hidden="true" />
                    {t("newConversation")}
                  </Button>
                ) : null}
                <Button type="button" size="icon" variant="ghost" className="size-10 rounded-xl sm:hidden" aria-label={t("newConversation")} onClick={onNewConversation}>
                  <MessageSquarePlusIcon className="size-4" aria-hidden="true" />
                </Button>
                {!canChat && canRunSetup ? (
                  <Button type="button" size="sm" className="min-h-10 gap-1.5 rounded-xl px-3 text-xs font-medium" onClick={() => setSetupOpen(true)}>
                    <Settings2Icon className="size-3.5" aria-hidden="true" />
                    {t("finishSetup")}
                  </Button>
                ) : null}
                <OrbitAccountMenu displayName={shell.displayName} />
              </div>
            }
          />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
        </div>

        <Dialog open={canRunSetup && setupOpen} onOpenChange={setSetupOpen}>
          <DialogContent className="max-h-[calc(100svh-2rem)] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("finishSetup")}</DialogTitle>
              <DialogDescription>{t("setupDialogDescription")}</DialogDescription>
            </DialogHeader>
            <SetupWizard
              mode="dialog"
              initialAgentId={selectedAgentId}
              onCancelAction={() => setSetupOpen(false)}
              onCompleteAction={() => {
                setSetupOpen(false);
                onSetupComplete?.();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </ChatComposerControlsContext.Provider>
  );
}
