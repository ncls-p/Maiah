"use client";

import { useTranslations } from "next-intl";
import { ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, usePathname } from "@/i18n/navigation";
import { isNavItemActive, type WorkspaceShellState } from "@/lib/workspace-nav";
import { buildMenuGroups } from "@/modules/navigation/sidebar-config";
import { cn } from "@/lib/utils";

const primaryDestinations = [
  "/chat",
  "/agents",
  "/tools",
  "/knowledge",
  "/scheduled-tasks",
] as const;

export function OrbitWordmark({ section }: { section: string }) {
  return (
    <div className="hidden min-w-32 items-baseline gap-2 sm:flex">
      <span className="text-[0.72rem] font-extrabold uppercase tracking-[0.16em] text-foreground">
        Maiah
      </span>
      <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-primary">
        {section}
      </span>
    </div>
  );
}

export function OrbitProductNavigation({
  shell,
}: {
  shell: WorkspaceShellState;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const allItems = buildMenuGroups(shell).flatMap((group) => group.items);
  const itemByHref = new Map(allItems.map((item) => [item.href, item]));
  const primaryItems = primaryDestinations
    .map((href) => itemByHref.get(href))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const primaryHrefs = new Set(primaryItems.map((item) => item.href));
  const secondaryItems = allItems.filter(
    (item, index) =>
      !primaryHrefs.has(item.href) &&
      allItems.findIndex((candidate) => candidate.href === item.href) === index,
  );
  const productLabel = (href: string, labelKey: string) => {
    if (href === "/tools") return t("toolsShort");
    if (href === "/knowledge") return t("knowledgeShort");
    if (href === "/scheduled-tasks") return t("planningShort");
    return t(labelKey);
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <nav
        aria-label={t("groups.primary")}
        className="scrollbar-none hidden min-w-0 items-center gap-0.5 overflow-x-auto rounded-xl bg-muted/55 p-1 md:flex"
      >
        {primaryItems.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-[0.72rem] font-medium transition-[background-color,color,box-shadow] duration-180",
                active
                  ? "bg-card text-foreground shadow-[var(--control-shadow)]"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
            >
              {productLabel(item.href, item.labelKey)}
              {item.badge ? (
                <span className="ml-1.5 font-mono text-[0.58rem] text-primary">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {secondaryItems.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <SlidersHorizontalIcon className="size-3.5" aria-hidden="true" />
              <span className="hidden lg:inline">{t("groups.advanced")}</span>
              <ChevronDownIcon className="size-3" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-60">
            {secondaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} className="min-h-10 gap-2.5">
                    <Icon className="size-4" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {t(item.labelKey)}
                    </span>
                    {item.badge ? (
                      <span className="font-mono text-[0.62rem] text-primary">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function OrbitAccountMenu({ displayName }: { displayName?: string }) {
  const tShell = useTranslations("shell");
  const initial = displayName?.trim().charAt(0).toLocaleUpperCase() || "M";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background outline-none transition-[transform,box-shadow] hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={displayName || tShell("workspace")}
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuLabel className="truncate px-2.5 py-2 text-sm font-medium">
          {displayName || tShell("workspace")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="p-0">
          <LocaleSwitcher menu />
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="p-0">
          <ThemeToggleButton menu />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild variant="destructive" className="p-0">
          <SignOutButton className="h-10 w-full rounded-lg px-2.5 font-normal" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
