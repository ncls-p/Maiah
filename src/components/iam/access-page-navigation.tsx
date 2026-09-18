"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Tabs, TabsList } from "@/components/ui/tabs";

const items = [
  { href: "/members", key: "people" },
  { href: "/members/teams", key: "teams" },
  { href: "/members/roles", key: "roles" },
  { href: "/members/resources", key: "resources" },
] as const;

function activeHref(pathname: string) {
  return items.find((item) => pathname === item.href)?.href ?? "/members";
}

export function AccessPageNavigation({ children }: { children: ReactNode }) {
  const t = useTranslations("access.navigation");
  const pathname = usePathname();
  const active = activeHref(pathname);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <nav aria-label={t("label")}>
        <Tabs value={active} className="min-w-0 gap-0">
          <TabsList variant="line" className="w-full justify-start">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-slot="tabs-trigger"
                data-active={item.href === active ? "" : undefined}
                className={cn(
                  "t-tab relative inline-flex min-h-10 items-center justify-center px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground",
                  "after:absolute after:inset-x-4 after:bottom-[-0.45rem] after:h-px after:bg-foreground after:opacity-0 after:transition-opacity",
                  item.href === active && "text-foreground after:opacity-100",
                )}
              >
                {t(item.key)}
              </Link>
            ))}
          </TabsList>
        </Tabs>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
