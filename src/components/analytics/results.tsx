"use client";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AuditAnalytics,
  Cost,
  UsageAnalytics,
} from "@/modules/analytics/types";
import { UsageChart } from "./usage-chart";

export function formatCosts(costs: Cost[], locale: string) {
  return (
    costs
      .map(
        (cost) =>
          `${cost.amount.toLocaleString(locale, { maximumFractionDigits: 6 })} ${cost.currency}`,
      )
      .join(" · ") || "—"
  );
}
function Stats({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="break-words text-2xl font-semibold tabular-nums">
              {item.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
export function UsageResults({ data }: { data: UsageAnalytics }) {
  const t = useTranslations("analytics");
  const locale = useLocale();
  const num = (value: number) => value.toLocaleString(locale);
  return (
    <div className="flex flex-col gap-5">
      <Stats
        items={[
          { label: t("cost"), value: formatCosts(data.totals.costs, locale) },
          {
            label: t("tokens"),
            value: num(data.totals.inputTokens + data.totals.outputTokens),
          },
          { label: t("events"), value: num(data.totals.events) },
          { label: t("failed"), value: num(data.totals.failedEvents) },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        {t("coverage", {
          count: data.totals.unpricedEvents,
          latency: data.totals.averageLatencyMs,
        })}
      </p>
      {data.quota && (
        <p className="text-sm text-muted-foreground">
          {t("quota", {
            used: num(data.quota.used),
            limit: num(data.quota.limit),
            remaining: num(data.quota.remaining),
          })}
        </p>
      )}
      <UsageChart
        key={`${data.groups.map((group) => group.id).join(":")}:${data.totals.costs.map((cost) => cost.currency).join(":")}`}
        data={data}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("breakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "dimension",
                  "events",
                  "inputTokens",
                  "outputTokens",
                  "cost",
                ].map((key) => (
                  <TableHead key={key}>{t(key)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.groups.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-80 whitespace-normal">
                    {row.name || t("unknown")}
                    <span className="block text-xs text-muted-foreground">
                      {row.id.slice(0, 8)}
                    </span>
                  </TableCell>
                  <TableCell>{num(row.events)}</TableCell>
                  <TableCell>{num(row.inputTokens)}</TableCell>
                  <TableCell>{num(row.outputTokens)}</TableCell>
                  <TableCell>{formatCosts(row.costs, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!data.groups.length && (
            <p className="py-5 text-center text-muted-foreground">
              {t("empty")}
            </p>
          )}
        </CardContent>
      </Card>
      <details className="rounded-2xl border bg-card p-5">
        <summary className="cursor-pointer font-medium">
          {t("eventDetails")}
        </summary>
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              {[
                "date",
                "userIds",
                "workspaceIds",
                "providerIds",
                "modelIds",
                "tokens",
                "cost",
                "status",
              ].map((key) => (
                <TableHead key={key}>{t(key)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  {new Date(event.createdAt).toLocaleString(locale)}
                </TableCell>
                <TableCell>{event.userName ?? "—"}</TableCell>
                <TableCell>{event.workspaceName ?? "—"}</TableCell>
                <TableCell>{event.providerName ?? "—"}</TableCell>
                <TableCell>{event.modelName ?? "—"}</TableCell>
                <TableCell>
                  {num((event.inputTokens ?? 0) + (event.outputTokens ?? 0))}
                </TableCell>
                <TableCell>
                  {event.cost != null && event.currency
                    ? formatCosts(
                        [
                          {
                            currency: event.currency,
                            amount: Number(event.cost),
                          },
                        ],
                        locale,
                      )
                    : "—"}
                </TableCell>
                <TableCell>
                  {event.operation} · {event.status ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </div>
  );
}
export function AuditResults({ data }: { data: AuditAnalytics }) {
  const t = useTranslations("analytics");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-5">
      <Stats
        items={["total", "success", "failed", "denied"].map((key) => ({
          label: t(key === "total" ? "events" : key),
          value:
            data.totals[key as keyof typeof data.totals].toLocaleString(locale),
        }))}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("eventDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!data.events.length && (
            <p className="py-8 text-center text-muted-foreground">
              {t("empty")}
            </p>
          )}
          {data.events.map((event) => (
            <details key={event.id} className="rounded-xl border p-4">
              <summary className="cursor-pointer">
                <span className="inline-flex max-w-full flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      event.outcome === "success" ? "secondary" : "outline"
                    }
                  >
                    {event.outcome}
                  </Badge>
                  <span className="break-all font-medium">{event.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString(locale)} ·{" "}
                    {event.actorName ?? event.actorEmail ?? t("unknown")}
                  </span>
                </span>
              </summary>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {[
                  ["organizationIds", event.organizationName],
                  ["workspaceIds", event.workspaceName],
                  ["userIds", event.actorEmail ?? event.actorPrincipalId],
                  ["resourceType", event.resourceType],
                  ["resourceId", event.resourceId],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">{t(key!)}</dt>
                    <dd className="break-all">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              {event.metadataJson != null && (
                <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(event.metadataJson, null, 2)}
                </pre>
              )}
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
export function ResultsPagination({
  offset,
  limit,
  total,
  busy,
  onPage,
}: {
  offset: number;
  limit: number;
  total: number;
  busy: boolean;
  onPage: (offset: number) => void;
}) {
  const t = useTranslations("analytics");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {t("pagination", {
          from: total ? offset + 1 : 0,
          to: Math.min(offset + limit, total),
          total,
        })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={busy || offset === 0}
          onClick={() => onPage(Math.max(0, offset - limit))}
        >
          {t("previous")}
        </Button>
        <Button
          variant="outline"
          disabled={busy || offset + limit >= total}
          onClick={() => onPage(offset + limit)}
        >
          {t("next")}
        </Button>
      </div>
    </div>
  );
}
