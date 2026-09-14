"use client";
import { chartDates } from "@/modules/analytics/chart-dates";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GovernanceSelect } from "@/components/iam/governance-select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { FilterSelect } from "./filter-select";
import type { UsageAnalytics, UsageGroup } from "@/modules/analytics/types";

export function chartValue(row: UsageGroup, metric: string) {
  if (metric.startsWith("cost:"))
    return row.costs
      .filter((cost) => cost.currency === metric.slice(5))
      .reduce((sum, cost) => sum + cost.amount, 0);
  if (metric === "tokens") return row.inputTokens + row.outputTokens;
  return row.events;
}
export function UsageChart({ data }: { data: UsageAnalytics }) {
  const t = useTranslations("analytics");
  const locale = useLocale();
  const [metric, setMetric] = useState("tokens");
  const [mode, setMode] = useState("compare");
  const [selection, setSelection] = useState<string | null>(null);
  const selected = selection
    ? selection.split(",")
    : (selection === null ? data.groups.slice(0, 8) : data.groups).map(
        (group) => group.id,
      );
  const active = data.groups.filter((group) => selected.includes(group.id));
  const dates = chartDates(
    data.series.map((row) => row.date),
    data.period,
  );
  const pointX = (index: number) =>
    70 +
    ((Date.parse(dates[index]) - Date.parse(dates[0])) * 750) /
      Math.max(1, Date.parse(dates[dates.length - 1]) - Date.parse(dates[0]));
  const lines = useMemo(() => {
    const ids = selection
      ? selection.split(",")
      : (selection === null ? data.groups.slice(0, 8) : data.groups).map(
          (row) => row.id,
        );
    const grouped = data.groups.filter((row) => ids.includes(row.id));
    const buckets = chartDates(
      data.series.map((row) => row.date),
      data.period,
    );
    const points = new Map(
      data.series.map((row) => [
        `${row.id}:${row.date}`,
        chartValue(row, metric),
      ]),
    );
    return mode === "merge"
      ? [
          {
            id: "merged",
            name: t("merged"),
            points: buckets.map((date) =>
              grouped.reduce(
                (sum, row) => sum + (points.get(`${row.id}:${date}`) ?? 0),
                0,
              ),
            ),
          },
        ]
      : grouped.map((row) => ({
          id: row.id,
          name: row.name || t("unknown"),
          points: buckets.map((date) => points.get(`${row.id}:${date}`) ?? 0),
        }));
  }, [data, selection, metric, mode, t]);
  const maximum = lines.reduce(
    (max, line) =>
      line.points.reduce((value, point) => Math.max(value, point), max),
    1,
  );
  const minimum = lines.reduce(
    (min, line) =>
      line.points.reduce((value, point) => Math.min(value, point), min),
    0,
  );
  const pointY = (value: number) =>
    200 - ((value - minimum) / (maximum - minimum)) * 170;
  const colors = [
    "var(--primary)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("trend")}</CardTitle>
        <CardDescription>{t("chartHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <GovernanceSelect
            label={t("metric")}
            value={metric}
            onChange={setMetric}
            options={[
              { id: "tokens", name: t("tokens") },
              { id: "events", name: t("events") },
              ...data.totals.costs.map((cost) => ({
                id: `cost:${cost.currency}`,
                name: `${t("cost")} · ${cost.currency}`,
              })),
            ]}
          />
          <GovernanceSelect
            label={t("visualization")}
            value={mode}
            onChange={setMode}
            options={["compare", "merge"].map((id) => ({ id, name: t(id) }))}
          />
          <FilterSelect
            label={t("series")}
            options={data.groups.map((group) => ({
              id: group.id,
              name: group.name || t("unknown"),
            }))}
            value={
              selection ??
              data.groups
                .slice(0, 8)
                .map((group) => group.id)
                .join(",")
            }
            onChange={setSelection}
          />
        </div>
        {!dates.length ? (
          <p className="py-10 text-center text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <>
            <svg
              viewBox="0 0 840 240"
              role="img"
              aria-label={t("chartAccessible")}
              className="h-60 w-full overflow-visible"
            >
              {[0, 0.5, 1].map((step) => (
                <g key={step}>
                  <line
                    x1="70"
                    y1={200 - step * 170}
                    x2="820"
                    y2={200 - step * 170}
                    stroke="var(--border)"
                  />
                  <text
                    x="60"
                    y={204 - step * 170}
                    textAnchor="end"
                    fill="var(--muted-foreground)"
                    fontSize="11"
                  >
                    {(minimum + (maximum - minimum) * step).toLocaleString(
                      locale,
                      {
                        maximumFractionDigits: 2,
                        notation: "compact",
                      },
                    )}
                  </text>
                </g>
              ))}
              {lines.map((line, index) => (
                <g key={line.id}>
                  <polyline
                    fill="none"
                    stroke={colors[index % colors.length]}
                    strokeWidth="2.5"
                    strokeDasharray={index >= 5 ? "5 3" : undefined}
                    points={line.points
                      .map((value, i) => `${pointX(i)},${pointY(value)}`)
                      .join(" ")}
                  />
                  {line.points.map((value, i) => (
                    <circle
                      key={i}
                      cx={pointX(i)}
                      cy={pointY(value)}
                      r="3"
                      fill={colors[index % colors.length]}
                    >
                      <title>{`${line.name} · ${dates[i]} · ${value.toLocaleString(locale)}`}</title>
                    </circle>
                  ))}
                </g>
              ))}
              <text x="70" y="230" fill="var(--muted-foreground)" fontSize="12">
                {dates[0]} UTC
              </text>
              <text
                x="820"
                y="230"
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize="12"
              >
                {dates.at(-1)} UTC
              </text>
            </svg>
            <div className="flex flex-wrap gap-3">
              {lines.map((line, index) => (
                <span key={line.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: colors[index % colors.length] }}
                  />
                  {line.name}
                </span>
              ))}
            </div>
            <details>
              <summary className="cursor-pointer text-sm">
                {t("chartData")}
              </summary>
              <div className="mt-3 max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">{t("date")}</th>
                      {lines.map((line) => (
                        <th key={line.id} className="p-2 text-right">
                          {line.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dates.map((date, index) => (
                      <tr key={date}>
                        <td>{date}</td>
                        {lines.map((line) => (
                          <td
                            key={line.id}
                            className="p-2 text-right tabular-nums"
                          >
                            {line.points[index].toLocaleString(locale, {
                              maximumFractionDigits: 6,
                            })}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          {t("selectedSeries", { count: active.length })}
        </p>
      </CardContent>
    </Card>
  );
}
