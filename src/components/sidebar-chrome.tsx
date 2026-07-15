"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { DeodisLogo } from "@/components/deodis-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const APP_SIDEBAR_SURFACE_CLASS =
  "border-sidebar-border/70 bg-sidebar text-sidebar-foreground";

export function SidebarHeader({
  contextLabel,
  action,
  collapsed = false,
}: {
  contextLabel: string;
  action?: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-sidebar-border/60 px-3",
          collapsed
            ? "h-24 flex-col justify-center gap-1.5 px-2"
            : "h-16 justify-between gap-3",
        )}
      >
        <div
          className={cn(
            "flex min-w-0",
            collapsed
              ? "items-center justify-center"
              : "flex-col items-start justify-center",
          )}
        >
          <DeodisLogo
            href="/chat"
            className={cn(
              "shrink-0 object-contain",
              collapsed ? "size-6" : "h-6 w-auto",
            )}
            label="Deodis chat"
          />
          {!collapsed ? (
            <span className="-mt-1 max-w-full truncate pl-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-primary/75">
              {contextLabel}
            </span>
          ) : null}
        </div>
        {action}
      </div>
    </>
  );
}

export function SidebarFooter({
  displayName,
  collapsed = false,
}: {
  displayName?: string | null;
  collapsed?: boolean;
}) {
  const tShell = useTranslations("shell");
  const tCommon = useTranslations("common");
  const initial = displayName?.trim().charAt(0).toLocaleUpperCase() || "D";

  if (collapsed) {
    return (
      <>
        <div className="mt-auto flex shrink-0 flex-col items-center gap-1.5 border-t border-sidebar-border/60 px-2 py-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <LocaleSwitcher compact className="size-10 rounded-xl" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">{tCommon("language")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <ThemeToggleButton iconOnly className="size-10 rounded-xl" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">{tShell("theme")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <SignOutButton iconOnly className="size-10 rounded-xl" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">{tShell("signOut")}</TooltipContent>
          </Tooltip>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mt-auto shrink-0 border-t border-sidebar-border/60 p-2.5">
        <div className="rounded-2xl bg-background/72 p-2 shadow-[var(--control-shadow)] backdrop-blur-sm">
          {displayName ? (
            <div className="mb-2 flex min-w-0 items-center gap-2 px-1 py-0.5">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary"
              >
                {initial}
              </span>
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {displayName}
              </p>
            </div>
          ) : null}
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.5rem_2.5rem] gap-1.5">
            <LocaleSwitcher className="h-10 rounded-xl" />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <ThemeToggleButton iconOnly className="size-10 rounded-xl" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{tShell("theme")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <SignOutButton iconOnly className="size-10 rounded-xl" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{tShell("signOut")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </>
  );
}

export function sidebarNavItemClassName({
  active,
  collapsed = false,
}: {
  active: boolean;
  collapsed?: boolean;
}) {
  return cn(
    "group relative flex min-h-10 items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.98]",
    active
      ? "nav-item-active bg-card text-sidebar-accent-foreground shadow-[var(--control-shadow)]"
      : "text-sidebar-foreground/68 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    collapsed && "justify-center px-1.5",
  );
}

export function SidebarNavIcon({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg transition-[background-color,color] duration-150",
        active ? "bg-accent text-primary" : "text-current",
      )}
    >
      {children}
    </span>
  );
}
