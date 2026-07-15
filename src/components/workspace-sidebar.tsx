"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MenuIcon,
} from "lucide-react";

import {
  APP_SIDEBAR_SURFACE_CLASS,
  SidebarFooter,
  SidebarHeader,
  SidebarNavIcon,
  sidebarNavItemClassName,
} from "@/components/sidebar-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DEFAULT_APP_SIDEBAR_WIDTH,
  MAX_APP_SIDEBAR_WIDTH,
  MIN_APP_SIDEBAR_WIDTH,
  getStoredAppSidebarWidth,
  setStoredAppSidebarWidth,
  subscribeAppSidebarWidth,
} from "@/lib/sidebar-layout";
import {
  isNavItemActive,
  type NavGroup,
  type NavItem,
  type WorkspaceShellState,
} from "@/lib/workspace-nav";
import { buildMenuGroups } from "@/modules/navigation/sidebar-config";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "workspace-sidebar-collapsed";
const STORAGE_EVENT = "workspace-sidebar-collapsed-change";

function subscribeCollapsed(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

function getStoredCollapsed(isDefaultCollapsed: boolean): boolean {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === "true";
  return isDefaultCollapsed;
}

type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  isMobile: boolean;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useWorkspaceSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceSidebar must be used within WorkspaceSidebarProvider",
    );
  }
  return ctx;
}

export function WorkspaceSidebarProvider({
  children,
  defaultCollapsed = false,
}: {
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const isMobile = useIsMobile();
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    () => getStoredCollapsed(defaultCollapsed),
    () => defaultCollapsed,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const setCollapsed = useCallback((isCollapsed: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(isCollapsed));
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed,
      mobileOpen,
      setMobileOpen,
      isMobile,
    }),
    [collapsed, isMobile, mobileOpen, setCollapsed, toggleCollapsed],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

function SidebarNavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const label = t(item.labelKey);
  const Icon = item.icon;
  const active = isNavItemActive(pathname, item.href);

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={sidebarNavItemClassName({ active, collapsed })}
    >
      <SidebarNavIcon active={active}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />
      </SidebarNavIcon>
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {item.badge && item.badge > 0 ? (
            <Badge
              variant="secondary"
              className="ml-auto h-5 min-w-[1.25rem] px-1.5 text-xs font-medium"
            >
              {item.badge}
            </Badge>
          ) : null}
        </>
      ) : null}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">
          {label}
          {item.badge && item.badge > 0 ? ` (${item.badge})` : ""}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

function SidebarNavGroups({
  groups,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.groups");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const advancedGroup = groups.find((group) => group.labelKey === "advanced");
  const simpleGroups = groups.filter((group) => group.labelKey !== "advanced");
  const showAdvancedItems = !collapsed && advancedOpen;

  return (
    <nav className="scrollbar-thin flex flex-1 flex-col gap-2 overflow-y-auto px-2.5 py-3">
      {simpleGroups.map((group) => (
        <div key={group.labelKey} className="flex flex-col gap-1.5">
          {!collapsed ? (
            <p className="px-2 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
              {t(group.labelKey)}
            </p>
          ) : null}
          {group.items.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}

      {advancedGroup ? (
        <div className="mt-1 flex flex-col gap-1.5 border-t border-sidebar-border/70 pt-3">
          {!collapsed ? (
            <button
              type="button"
              className="flex min-h-9 w-full items-center justify-between rounded-xl px-2 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              aria-expanded={showAdvancedItems}
              onClick={() => setAdvancedOpen(!showAdvancedItems)}
            >
              <span>{t("advanced")}</span>
              <ChevronDownIcon
                className={cn(
                  "size-3.5 transition-transform",
                  showAdvancedItems && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
          ) : null}
          {showAdvancedItems
            ? advancedGroup.items.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))
            : null}
        </div>
      ) : null}
    </nav>
  );
}

function SidebarPanel({
  shell,
  collapsed,
  onNavigate,
  showCollapseControl = true,
}: {
  shell: WorkspaceShellState;
  collapsed: boolean;
  onNavigate?: () => void;
  showCollapseControl?: boolean;
}) {
  const { toggleCollapsed } = useWorkspaceSidebar();
  const tShell = useTranslations("shell");
  const groups = buildMenuGroups(shell);

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent text-sidebar-foreground">
      <SidebarHeader
        contextLabel={tShell("navigation")}
        collapsed={collapsed}
        action={
          showCollapseControl ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-xl"
              onClick={toggleCollapsed}
              aria-label={
                collapsed ? tShell("expandSidebar") : tShell("collapseSidebar")
              }
            >
              {collapsed ? (
                <ChevronRightIcon aria-hidden="true" />
              ) : (
                <ChevronLeftIcon aria-hidden="true" />
              )}
            </Button>
          ) : null
        }
      />
      <div className="animate-in-fade flex min-h-0 flex-1 flex-col motion-reduce:animate-none">
        <SidebarNavGroups
          groups={groups}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>
      <SidebarFooter displayName={shell.displayName} collapsed={collapsed} />
    </div>
  );
}

export function WorkspaceSidebar({ shell }: { shell: WorkspaceShellState }) {
  const tShell = useTranslations("shell");
  const { collapsed, isMobile } = useWorkspaceSidebar();
  const width = useSyncExternalStore(
    subscribeAppSidebarWidth,
    getStoredAppSidebarWidth,
    () => DEFAULT_APP_SIDEBAR_WIDTH,
  );
  const [resizing, setResizing] = useState(false);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    if (collapsed) return;
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

  function adjustWidth(delta: number) {
    setStoredAppSidebarWidth(width + delta);
  }

  if (isMobile) {
    return null;
  }

  return (
    <aside
      data-slot="workspace-sidebar"
      className={cn(
        "relative hidden h-full shrink-0 border-r md:flex md:flex-col",
        APP_SIDEBAR_SURFACE_CLASS,
        !resizing && "transition-[width] duration-200",
      )}
      style={{ width: collapsed ? "4rem" : `${width}px` }}
    >
      <SidebarPanel shell={shell} collapsed={collapsed} />
      {!collapsed ? (
        <div
          role="separator"
          aria-label={tShell("resizeNavigation")}
          aria-orientation="vertical"
          aria-valuemin={MIN_APP_SIDEBAR_WIDTH}
          aria-valuemax={MAX_APP_SIDEBAR_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          className="group absolute inset-y-0 bottom-24 right-0 z-10 w-2 translate-x-1 cursor-col-resize outline-none"
          onPointerDown={startResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") adjustWidth(-12);
            if (event.key === "ArrowRight") adjustWidth(12);
          }}
        >
          <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-border group-focus-visible:bg-ring" />
        </div>
      ) : null}
    </aside>
  );
}

export function WorkspaceSidebarMobileTrigger({
  className,
  shell,
}: {
  className?: string;
  shell: WorkspaceShellState;
}) {
  const tShell = useTranslations("shell");
  const { mobileOpen, setMobileOpen } = useWorkspaceSidebar();
  const hasPending = shell.pendingToolCount > 0;

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("relative md:hidden", className)}
          aria-label={tShell("openNavigation")}
        >
          <MenuIcon aria-hidden="true" />
          {hasPending ? (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-xs"
            >
              {shell.pendingToolCount}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100vw-1rem,19rem)] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{tShell("navigation")}</SheetTitle>
        </SheetHeader>
        <SidebarPanel
          shell={shell}
          collapsed={false}
          showCollapseControl={false}
          onNavigate={() => setMobileOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
