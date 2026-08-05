import { BarChart3Icon } from "lucide-react";
import type { useTranslations } from "next-intl";

import { formatFullCount } from "./usage-formatters";
import type { UsageResponse } from "./usage-types";

type T = ReturnType<typeof useTranslations<"admin.usage">>;

export function UsageTrend(props: { daily: UsageResponse["daily"]; locale: string; t: T }) {
  const points = props.daily.slice(-30);
  const max = Math.max(...points.map((point) => point.inputTokens + point.outputTokens), 1);
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-[var(--surface-shadow)]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <BarChart3Icon className="size-4 text-primary" aria-hidden="true" />
            {props.t("dailyTrend")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{props.t("dailyTrendDescription")}</p>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <i className="size-2 rounded-sm bg-chart-1" />
            {props.t("inputLegend")}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-2 rounded-sm bg-chart-2" />
            {props.t("outputLegend")}
          </span>
        </div>
      </div>
      {points.length === 0 ? (
        <div className="grid h-44 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">{props.t("noChartData")}</div>
      ) : (
        <div className="flex h-48 items-end gap-1.5" aria-label={props.t("dailyTrend")}>
          {points.map((point) => {
            const inputHeight = (point.inputTokens / max) * 100;
            const outputHeight = (point.outputTokens / max) * 100;
            return (
              <div key={point.date} className="group flex h-full min-w-0 flex-1 items-end gap-px" title={`${point.date} · ${formatFullCount(point.inputTokens + point.outputTokens, props.locale)}`}>
                <div className="min-h-1 flex-1 rounded-t-sm bg-chart-1 transition-opacity group-hover:opacity-75" style={{ height: `${Math.max(2, inputHeight)}%` }} />
                <div className="min-h-1 flex-1 rounded-t-sm bg-chart-2 transition-opacity group-hover:opacity-75" style={{ height: `${Math.max(2, outputHeight)}%` }} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
