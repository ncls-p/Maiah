"use client";

import { UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AuditEvent,
  formatAction,
  outcomeMeta,
} from "./audit-dashboard.audit-event";

export function AuditEventRow({
  event,
  isLast,
  locale,
  t,
}: {
  event: AuditEvent;
  isLast: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations<"admin.audit">>;
}) {
  const meta = outcomeMeta(event.outcome);
  const OutcomeIcon = meta.icon;
  const parsed = formatAction(event.action);
  const actorLabel = event.actorName ?? event.actorEmail ?? t("systemActor");
  const createdAt = new Date(event.createdAt);
  const createdAtLabel = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(createdAt);
  const outcomeLabel =
    event.outcome === "success"
      ? t("outcomeSuccess")
      : event.outcome === "failed"
        ? t("outcomeFailed")
        : event.outcome === "denied"
          ? t("outcomeDenied")
          : meta.label;

  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-background",
            meta.dot,
            meta.ring,
          )}
        />
        {!isLast ? (
          <div className="my-1 w-px flex-1 bg-border/70" aria-hidden="true" />
        ) : null}
      </div>

      <article
        className={cn(
          "min-w-0 flex-1 rounded-xl border border-border/60 bg-background/80 px-4 py-3 transition-colors hover:border-primary/25 hover:bg-muted/20",
          !isLast && "mb-3",
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={meta.badge}
                className={cn(
                  "rounded-md capitalize",
                  event.outcome === "denied" &&
                    "border-warning/30 bg-warning/10 text-warning",
                )}
              >
                <OutcomeIcon aria-hidden="true" />
                {outcomeLabel}
              </Badge>
              {event.resourceType ? (
                <Badge
                  variant="outline"
                  className="rounded-md font-mono text-[11px]"
                >
                  {event.resourceType}
                </Badge>
              ) : null}
            </div>

            <div className="space-y-1">
              {typeof parsed === "object" ? (
                <p className="font-medium leading-snug">
                  <span className="text-muted-foreground">{parsed.scope}</span>
                  <span className="text-muted-foreground">.</span>
                  <span>{parsed.verb}</span>
                </p>
              ) : (
                <p className="font-medium leading-snug">{parsed}</p>
              )}
              <p className="font-mono text-xs text-muted-foreground">
                {event.action}
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span
                className="truncate"
                title={event.actorPrincipalId ?? undefined}
              >
                {actorLabel}
              </span>
            </div>
          </div>

          <time
            className="shrink-0 text-xs text-muted-foreground sm:text-right"
            dateTime={event.createdAt}
            title={createdAtLabel}
          >
            {createdAtLabel}
          </time>
        </div>
      </article>
    </div>
  );
}

export function computeStats(events: AuditEvent[]) {
  return events.reduce(
    (acc, event) => {
      acc.total += 1;
      if (event.outcome === "success") acc.success += 1;
      if (event.outcome === "failed") acc.failed += 1;
      if (event.outcome === "denied") acc.denied += 1;
      return acc;
    },
    { total: 0, success: 0, failed: 0, denied: 0 },
  );
}

export function AuditDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}
