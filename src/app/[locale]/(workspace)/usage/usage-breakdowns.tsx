import { BoxesIcon, ListTreeIcon, NetworkIcon, UsersIcon } from "lucide-react";
import type { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { formatCosts, formatFullCount } from "./usage-formatters";
import type { UsageBreakdown, UsageResponse } from "./usage-types";

type T = ReturnType<typeof useTranslations<"admin.usage">>;

export function UsageBreakdowns(props: {
  data: UsageResponse;
  locale: string;
  t: T;
}) {
  const tabs = [
    {
      value: "users",
      label: props.t("byUser"),
      icon: UsersIcon,
      rows: props.data.users,
      kind: "user" as const,
    },
    {
      value: "teams",
      label: props.t("byTeam"),
      icon: NetworkIcon,
      rows: props.data.teams,
      kind: "team" as const,
    },
    {
      value: "models",
      label: props.t("byModel"),
      icon: BoxesIcon,
      rows: props.data.models,
      kind: "model" as const,
    },
    {
      value: "operations",
      label: props.t("byOperation"),
      icon: ListTreeIcon,
      rows: props.data.operations,
      kind: "operation" as const,
    },
  ];
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-[var(--surface-shadow)]">
      <div className="mb-5">
        <h2 className="font-semibold">{props.t("breakdowns")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {props.t("breakdownsDescription")}
        </p>
      </div>
      <Tabs defaultValue="users">
        <TabsList>
          {tabs.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <BreakdownTable
              rows={tab.rows}
              kind={tab.kind}
              locale={props.locale}
              t={props.t}
            />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function labelFor(
  row: UsageBreakdown,
  kind: "user" | "team" | "model" | "operation",
  t: T,
) {
  if (kind === "operation") return row.operation ?? t("unknown");
  if (kind === "model") return row.name ?? row.modelId ?? t("unknownModel");
  return row.name ?? t("unknown");
}

function detailFor(
  row: UsageBreakdown,
  kind: "user" | "team" | "model" | "operation",
) {
  if (kind === "user") return row.email;
  if (kind === "model")
    return [row.providerName, row.modelId].filter(Boolean).join(" · ");
  return null;
}

function BreakdownTable(props: {
  rows: UsageBreakdown[];
  kind: "user" | "team" | "model" | "operation";
  locale: string;
  t: T;
}) {
  if (props.rows.length === 0) {
    return (
      <div className="mt-4 grid min-h-32 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
        {props.t("noBreakdownData")}
      </div>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-3 font-medium">{props.t("dimension")}</th>
            <th className="px-3 py-3 text-right font-medium">
              {props.t("events")}
            </th>
            <th className="px-3 py-3 text-right font-medium">
              {props.t("inputTokens")}
            </th>
            <th className="px-3 py-3 text-right font-medium">
              {props.t("outputTokens")}
            </th>
            <th className="px-3 py-3 text-right font-medium">
              {props.t("spend")}
            </th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => {
            const detail = detailFor(row, props.kind);
            return (
              <tr
                key={`${row.id ?? row.operation ?? "unknown"}-${index}`}
                className="border-b last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-3">
                  <div className="font-medium">
                    {labelFor(row, props.kind, props.t)}
                  </div>
                  {detail ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {detail}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatFullCount(row.events, props.locale)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {formatFullCount(row.inputTokens, props.locale)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {formatFullCount(row.outputTokens, props.locale)}
                </td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">
                  {formatCosts(row.costs, props.locale)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
