"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  organizationSettingsSections,
  platformSettingsSections,
} from "./settings-navigation";

export function SettingsSidebar({
  isPlatformAdmin,
}: {
  isPlatformAdmin: boolean;
}) {
  const t = useTranslations("admin.navigation");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId");
  const groups = [
    {
      label: "organization",
      sections: [...organizationSettingsSections.filter((section) => isPlatformAdmin || section !== "organization-data"), "connections"],
    },
    ...(isPlatformAdmin
      ? [{ label: "platform", sections: [...platformSettingsSections] }]
      : []),
  ];
  return (
    <>
      <label className="flex flex-col gap-2 text-sm font-medium lg:hidden">
        {t("label")}
        <select
          aria-label={t("label")}
          className="h-11 w-full rounded-lg border bg-card px-3"
          value={pathname}
          onChange={(event) => {
            router.push(
              organizationId
                ? { pathname: event.target.value, query: { organizationId } }
                : event.target.value,
            );
          }}
        >
          {groups.map((group) => (
            <optgroup key={group.label} label={t(group.label)}>
              {group.sections.map((section) => (
                <option
                  key={section}
                  value={
                    section === "connections"
                      ? "/admin/connections"
                      : `/admin/settings/${section}`
                  }
                >
                  {t(section)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <nav
        aria-label={t("label")}
        className="hidden flex-col gap-5 lg:flex rounded-xl border bg-card p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
      >
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground">
              {t(group.label)}
            </p>
            <ul className="flex flex-wrap gap-1 lg:flex-col">
              {group.sections.map((section) => {
                const href =
                  section === "connections"
                    ? "/admin/connections"
                    : `/admin/settings/${section}`;
                const active = pathname === href;
                return (
                  <li key={section}>
                    <Link
                      href={
                        organizationId
                          ? { pathname: href, query: { organizationId } }
                          : href
                      }
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                        active
                          ? "bg-muted font-semibold text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {t(section)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
