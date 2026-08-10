"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EPHEMERAL_TTL_OPTIONS } from "@/modules/chat/ephemeral-retention";
import {
  ChevronDownIcon,
  Clock3Icon,
  LoaderCircleIcon,
  SaveIcon,
  TimerResetIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

function countdownParts(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

const RETENTION_LABEL_KEYS = {
  5: "ephemeralRetention5",
  720: "ephemeralRetention720",
  1440: "ephemeralRetention1440",
  2880: "ephemeralRetention2880",
  10080: "ephemeralRetention10080",
} as const;

export function ConversationRetentionBanner({
  temporary,
  ttlMinutes,
  expiresAt,
  hasConversation,
  canConvert,
  converting,
  extending,
  onConvert,
  onExtend,
}: {
  temporary: boolean;
  ttlMinutes: number;
  expiresAt: string | null;
  hasConversation: boolean;
  canConvert: boolean;
  converting: boolean;
  extending: boolean;
  onConvert: () => void;
  onExtend: (ttlMinutes: number) => void;
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;

  useEffect(() => {
    if (!temporary || !Number.isFinite(expiresAtMs)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [expiresAtMs, temporary]);

  const remainingMs = Number.isFinite(expiresAtMs) ? expiresAtMs - now : null;
  const countdown = useMemo(() => {
    if (remainingMs === null) return t("temporaryCountdownPendingShort");
    if (remainingMs <= 0) return t("temporaryCountdownExpired");
    const { days, hours, minutes, seconds } = countdownParts(remainingMs);
    if (days > 0) return t("temporaryCountdownDays", { days, hours });
    if (hours > 0) return t("temporaryCountdownHours", { hours, minutes });
    if (minutes > 0)
      return t("temporaryCountdownMinutes", { minutes, seconds });
    return t("temporaryCountdownSeconds", { seconds });
  }, [remainingMs, t]);
  const scheduledAt = useMemo(
    () =>
      Number.isFinite(expiresAtMs)
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(expiresAtMs)
        : null,
    [expiresAtMs, locale],
  );
  const remainingRatio =
    remainingMs === null
      ? 1
      : Math.max(0, Math.min(1, remainingMs / (ttlMinutes * 60_000)));
  const deletionLabel =
    remainingMs === null
      ? countdown
      : t("temporaryCompactDeletesIn", { time: countdown });
  const longerRetentionOptions = EPHEMERAL_TTL_OPTIONS.filter(
    (option) => option > ttlMinutes,
  );

  if (!temporary) {
    return null;
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="shrink-0 border-b border-border/40 bg-background/45 px-2.5 py-2 backdrop-blur-md sm:px-4"
      aria-label={t("temporaryIndicator")}
    >
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl border border-amber-500/20 bg-background/92 shadow-[0_8px_28px_-20px_rgba(120,74,0,0.65)]">
        <div className="flex min-h-11 items-center gap-1.5 px-2 sm:gap-2 sm:px-2.5">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300"
            aria-hidden="true"
          >
            <Clock3Icon className="size-4" />
          </span>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 text-left outline-none transition-colors hover:bg-amber-500/[0.055] focus-visible:ring-2 focus-visible:ring-amber-500/40"
              aria-label={
                open ? t("temporaryHideDetails") : t("temporaryShowDetails")
              }
            >
              <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300 min-[430px]:inline">
                {t("temporaryBadge")}
              </span>
              <span
                className="hidden h-3.5 w-px bg-border min-[430px]:block"
                aria-hidden="true"
              />
              <span className="min-w-0 truncate text-xs font-semibold tabular-nums text-foreground sm:text-sm">
                {deletionLabel}
              </span>
              <ChevronDownIcon
                className={cn(
                  "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
          </CollapsibleTrigger>
          {canConvert ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "min-h-9 shrink-0 rounded-xl px-2.5 text-xs font-semibold text-amber-800 transition-[background-color,transform] hover:bg-amber-500/10 hover:text-amber-900 active:scale-[0.97] dark:text-amber-200 dark:hover:text-amber-100 sm:px-3",
                converting && "pointer-events-none",
              )}
              disabled={converting}
              onClick={onConvert}
            >
              {converting ? (
                <LoaderCircleIcon
                  className="size-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <SaveIcon className="size-3.5" aria-hidden="true" />
              )}
              {converting
                ? t("temporaryConverting")
                : t("temporaryMakePersistent")}
            </Button>
          ) : null}
        </div>
        <CollapsibleContent>
          <div className="grid items-center gap-1.5 border-t border-border/55 px-3 py-2.5 text-xs text-muted-foreground sm:grid-cols-[1fr_auto] sm:px-4">
            <p>
              {scheduledAt
                ? t("temporaryScheduledAt", { time: scheduledAt })
                : t("temporaryStartsAfterMessage")}
            </p>
            {hasConversation &&
            canConvert &&
            longerRetentionOptions.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="mt-1 justify-self-start rounded-lg border-amber-500/20 bg-background text-amber-800 hover:bg-amber-500/[0.07] dark:text-amber-200 sm:mt-0 sm:justify-self-end"
                    disabled={extending}
                  >
                    {extending ? (
                      <LoaderCircleIcon
                        className="size-3 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <TimerResetIcon className="size-3" aria-hidden="true" />
                    )}
                    {extending ? t("temporaryExtending") : t("temporaryExtend")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {longerRetentionOptions.map((option) => (
                    <DropdownMenuItem
                      key={option}
                      onSelect={() => onExtend(option)}
                    >
                      {t(RETENTION_LABEL_KEYS[option])}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <p className="sm:col-span-2">{t("temporaryRestartsOnActivity")}</p>
          </div>
        </CollapsibleContent>
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-950/[0.04]"
          aria-hidden="true"
        >
          <span
            className="block h-full origin-left bg-amber-500/65 transition-transform duration-1000 ease-linear"
            style={{ transform: `scaleX(${remainingRatio})` }}
          />
        </span>
      </div>
    </Collapsible>
  );
}
