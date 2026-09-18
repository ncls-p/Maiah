"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AdminSettingsTabs({
  organization,
  platform,
}: {
  organization: ReactNode;
  platform: ReactNode | null;
}) {
  const t = useTranslations("admin.settingsPage.tabs");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const active =
    requested === "platform" && platform ? "platform" : "organization";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "organization") params.delete("tab");
    else params.set("tab", value);
    router.push(params.size ? `${pathname}?${params}` : pathname, {
      scroll: false,
    });
  }

  return (
    <Tabs value={active} onValueChange={select} className="min-w-0 gap-5">
      <TabsList variant="line" aria-label={t("label")} className="justify-start">
        <TabsTrigger value="organization">{t("organization")}</TabsTrigger>
        {platform ? (
          <TabsTrigger value="platform">{t("platform")}</TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="organization" className="flex flex-col gap-6">
        {organization}
      </TabsContent>
      {platform ? (
        <TabsContent value="platform" className="flex flex-col gap-6">
          {platform}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
