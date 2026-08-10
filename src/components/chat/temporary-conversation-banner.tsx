"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock3Icon, LoaderCircleIcon, SaveIcon } from "lucide-react";
import { useTranslations } from "next-intl";

const retentionKeys = { 5: "ephemeralRetention5", 720: "ephemeralRetention720", 1440: "ephemeralRetention1440", 2880: "ephemeralRetention2880", 10080: "ephemeralRetention10080" } as const;

export function TemporaryConversationBanner({ ttlMinutes, canConvert, converting, onConvert }: { ttlMinutes: number; canConvert: boolean; converting: boolean; onConvert: () => void }) {
  const t = useTranslations("chat");
  const retentionKey = retentionKeys[ttlMinutes as keyof typeof retentionKeys] ?? "ephemeralRetention1440";

  return (
    <div className="flex min-h-11 items-center justify-between gap-3 bg-amber-500/[0.06] px-4 py-1.5 text-xs shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--border)_55%,transparent)]" role="status">
      <div className="flex min-w-0 items-center gap-2 text-amber-800 dark:text-amber-200">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-500/10" aria-hidden="true">
          <Clock3Icon className="size-3.5" />
        </span>
        <span className="min-w-0">
          <span className="font-medium">{t("temporaryIndicator")}</span>
          <span className="ml-1 text-muted-foreground">· {t(retentionKey)}</span>
        </span>
      </div>
      {canConvert ? (
        <Button type="button" variant="outline" size="sm" className={cn("h-10 shrink-0 rounded-xl bg-background/70 px-3 text-xs transition-transform active:scale-[0.96]", converting && "pointer-events-none")} disabled={converting} onClick={onConvert}>
          {converting ? <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden="true" /> : <SaveIcon className="size-3.5" aria-hidden="true" />}
          {converting ? t("temporaryConverting") : t("temporaryMakePersistent")}
        </Button>
      ) : null}
    </div>
  );
}
