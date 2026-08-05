import {
ActivityIcon,
CircleDollarSignIcon,
GaugeIcon,
LayersIcon,
TimerIcon,
} from "lucide-react";
import type { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";

import {
formatCosts,
formatCount,
formatFullCount,
formatLatency,
successRate,
} from "./usage-formatters";
import type { UsageResponse } from "./usage-types";

type T = ReturnType<typeof useTranslations<"admin.usage">>;

export function UsageSummary(props: {
  data: UsageResponse;
  locale: string;
  t: T;
}) {
  const { data, locale, t } = props;
  const totalTokens = data.totals.inputTokens + data.totals.outputTokens;
  const success = successRate(data.totals.events, data.totals.failedEvents);
  return (
    <>
      {data.quota ? (
        <QuotaCard quota={data.quota} locale={locale} t={t} />
      ) : null}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard
          variant="usage"
          label={t("events")}
          value={formatCount(data.totals.events, locale)}
          icon={ActivityIcon}
          color="bg-primary/10 text-primary"
          accent="bg-primary"
        />
        <StatCard
          variant="usage"
          label={t("totalTokens")}
          value={formatCount(totalTokens, locale)}
          icon={LayersIcon}
          color="bg-chart-1/15 text-chart-1"
          accent="bg-chart-1"
        />
        <StatCard
          variant="usage"
          label={t("spend")}
          value={formatCosts(data.totals.costs, locale)}
          icon={CircleDollarSignIcon}
          color="bg-chart-2/15 text-chart-2"
          accent="bg-chart-2"
        />
        <StatCard
          variant="usage"
          label={t("successRate")}
          value={`${success.toFixed(1)}%`}
          icon={GaugeIcon}
          color="bg-success/10 text-success"
          accent="bg-success"
        />
        <StatCard
          variant="usage"
          label={t("averageLatency")}
          value={formatLatency(data.totals.averageLatencyMs)}
          icon={TimerIcon}
          color="bg-info/10 text-info"
          accent="bg-info"
        />
      </div>
    </>
  );
}

function QuotaCard(props: {
  quota: NonNullable<UsageResponse["quota"]>;
  locale: string;
  t: T;
}) {
  const ratio = props.quota.used / props.quota.limit;
  const percent = Math.min(100, Math.round(ratio * 100));
  const warning = ratio >= 0.8;
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--surface-shadow)]">
      <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <GaugeIcon className="size-4" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {props.t("monthlyTokens")}
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
            {formatFullCount(props.quota.used, props.locale)}
            <span className="text-base font-medium text-muted-foreground">
              {" "}
              / {formatFullCount(props.quota.limit, props.locale)}
            </span>
          </p>
        </div>
        <Badge variant={warning ? "destructive" : "secondary"}>
          {percent}% {props.t("used")}
        </Badge>
      </div>
      <div className="border-t px-5 py-4 sm:px-6">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              warning ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </section>
  );
}
