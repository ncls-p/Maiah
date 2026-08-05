import { ActivityIcon, TimerIcon } from "lucide-react";
import { useLocale, type useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

import { formatFullCount, formatLatency } from "./usage-formatters";
import type { UsageEvent } from "./usage-types";

type T = ReturnType<typeof useTranslations<"admin.usage">>;

export function UsageEvents(props: { events: UsageEvent[]; t: T }) {
  const locale = useLocale();
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-[var(--surface-shadow)]">
      <h2 className="flex items-center gap-2 font-semibold">
        <ActivityIcon className="size-4 text-primary" aria-hidden="true" />
        {props.t("recentUsage")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {props.t("recentUsageDescription")}
      </p>
      {props.events.length === 0 ? (
        <div className="mt-5 grid min-h-32 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
          {props.t("noEvents")}
        </div>
      ) : (
        <div className="mt-5 grid gap-2">
          {props.events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              locale={locale}
              t={props.t}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EventRow(props: { event: UsageEvent; locale: string; t: T }) {
  const total =
    (props.event.inputTokens ?? 0) + (props.event.outputTokens ?? 0);
  const date = new Intl.DateTimeFormat(props.locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(props.event.createdAt));
  const model = props.event.modelName ?? props.event.modelId;
  return (
    <article className="grid gap-3 rounded-xl border bg-background/70 px-4 py-3 transition-colors hover:bg-muted/25 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            {props.event.operation}
          </Badge>
          {props.event.status ? (
            <Badge
              variant={
                props.event.status === "success" ? "default" : "destructive"
              }
            >
              {props.event.status}
            </Badge>
          ) : null}
          <time
            className="text-xs text-muted-foreground"
            dateTime={props.event.createdAt}
          >
            {date}
          </time>
        </div>
        <p className="mt-2 truncate text-sm text-muted-foreground">
          {[props.event.userName, props.event.providerName, model]
            .filter(Boolean)
            .join(" · ") || props.t("unknown")}
        </p>
      </div>
      <div className="flex items-center gap-4 text-sm tabular-nums">
        <span>
          <strong>{formatFullCount(total, props.locale)}</strong>{" "}
          <span className="text-muted-foreground">{props.t("tokens")}</span>
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <TimerIcon className="size-3.5" aria-hidden="true" />
          {formatLatency(props.event.latencyMs)}
        </span>
      </div>
    </article>
  );
}
