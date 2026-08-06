"use client";

import { PanelLeftOpenIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState,useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Sheet,SheetContent,SheetHeader,SheetTitle,SheetTrigger } from "@/components/ui/sheet";
import { DEFAULT_APP_SIDEBAR_OPEN,DEFAULT_APP_SIDEBAR_WIDTH,MAX_APP_SIDEBAR_WIDTH,MIN_APP_SIDEBAR_WIDTH,getStoredAppSidebarOpen,getStoredAppSidebarWidth,setStoredAppSidebarOpen,setStoredAppSidebarWidth,subscribeAppSidebarOpen,subscribeAppSidebarWidth } from "@/lib/sidebar-layout";
import type { WorkspaceShellState } from "@/lib/workspace-nav";
import { WorkspaceHistoryContent } from "./workspace-history-sidebar.workspace-history-content";

export function WorkspaceHistorySidebar({ shell }: { shell: WorkspaceShellState }) {
  const tShell = useTranslations("shell");
  const width = useSyncExternalStore(subscribeAppSidebarWidth, getStoredAppSidebarWidth, () => DEFAULT_APP_SIDEBAR_WIDTH);
  const open = useSyncExternalStore(subscribeAppSidebarOpen, getStoredAppSidebarOpen, () => DEFAULT_APP_SIDEBAR_OPEN);
  const [resizing, setResizing] = useState(false);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onPointerMove(moveEvent: PointerEvent) {
      setStoredAppSidebarWidth(startWidth + moveEvent.clientX - startX);
    }

    function onPointerUp() {
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
  }

  return (
    <aside data-slot="workspace-history-sidebar" aria-hidden={!open} className={`relative hidden h-full shrink-0 overflow-hidden bg-sidebar/92 text-sidebar-foreground opacity-100 backdrop-blur-xl transition-[opacity,width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] md:flex md:flex-col ${open ? "border-r border-sidebar-border/65" : "pointer-events-none border-r-0"}`} style={{ width: open ? `${width}px` : 0, opacity: open ? 1 : 0 }}>
      {open ? <WorkspaceHistoryContent shell={shell} onCollapsedChange={(collapsed) => setStoredAppSidebarOpen(!collapsed)} /> : null}
      {open ? (
        <div
          role="separator"
          aria-label={tShell("resizeNavigation")}
          aria-orientation="vertical"
          aria-valuemin={MIN_APP_SIDEBAR_WIDTH}
          aria-valuemax={MAX_APP_SIDEBAR_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          className="group absolute inset-y-0 right-0 z-20 w-3 translate-x-1.5 cursor-col-resize outline-none"
          onPointerDown={startResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") setStoredAppSidebarWidth(width - 12);
            if (event.key === "ArrowRight") setStoredAppSidebarWidth(width + 12);
          }}
        >
          <div className={`mx-auto h-full w-px transition-colors ${resizing ? "bg-ring" : "bg-transparent group-hover:bg-border group-focus-visible:bg-ring"}`} />
        </div>
      ) : null}
    </aside>
  );
}

export function WorkspaceHistoryMobileTrigger({ shell }: { shell: WorkspaceShellState }) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const desktopSidebarOpen = useSyncExternalStore(subscribeAppSidebarOpen, getStoredAppSidebarOpen, () => DEFAULT_APP_SIDEBAR_OPEN);

  return (
    <>
      {!desktopSidebarOpen ? (
        <Button type="button" variant="ghost" size="icon" className="hidden size-10 rounded-xl active:scale-[0.96] md:inline-flex" aria-label={t("openConversations")} onClick={() => setStoredAppSidebarOpen(true)}>
          <PanelLeftOpenIcon className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-10 md:hidden" aria-label={t("openConversations")}>
            <PanelLeftOpenIcon className="size-4" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(100vw-1rem,20rem)] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("conversations")}</SheetTitle>
          </SheetHeader>
          <WorkspaceHistoryContent shell={shell} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
