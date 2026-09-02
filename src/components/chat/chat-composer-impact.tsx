"use client";

import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  CircleDollarSignIcon,
  LeafIcon,
  ZapIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { ChatUsageImpact } from "@/components/chat/chat-types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type ImpactMetric = {
  key: string;
  icon: typeof ZapIcon;
  value: string;
  label: string;
  description: string | null;
};

export function formatImpactMetrics(
  impact: ChatUsageImpact,
  locale: string,
  t: ReturnType<typeof useTranslations<"chat">>,
) {
  const number = (value: number, digits = 4) =>
    value.toLocaleString(locale, { maximumFractionDigits: digits });
  const chips: ImpactMetric[] = [];
  if (impact.cost !== null) {
    chips.push({
      key: "cost",
      icon: CircleDollarSignIcon,
      value: `${number(impact.cost)} ${impact.currency}`,
      label: t("impact.costLabel"),
      description: t("impact.costDescription"),
    });
  }
  if (impact.energyKwh !== null) {
    chips.push({
      key: "energy",
      icon: ZapIcon,
      value: `${number(impact.energyKwh)} kWh`,
      label: t("impact.energyLabel"),
      description: t("impact.energyDescription"),
    });
  }
  const details: ImpactMetric[] = [
    {
      key: "inputTokens",
      icon: ArrowUpFromLineIcon,
      value: number(impact.inputTokens, 0),
      label: t("impact.inputTokensLabel"),
      description: null,
    },
    {
      key: "outputTokens",
      icon: ArrowDownToLineIcon,
      value: number(impact.outputTokens, 0),
      label: t("impact.outputTokensLabel"),
      description: null,
    },
    ...chips,
  ];
  if (impact.co2Grams !== null) {
    details.push({
      key: "co2",
      icon: LeafIcon,
      value: `${number(impact.co2Grams, 2)} g CO₂e`,
      label: t("impact.co2Label"),
      description: t("impact.co2Description"),
    });
  }
  return { chips, details };
}

export function ChatComposerImpact({ impact }: { impact: ChatUsageImpact }) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const { chips, details } = formatImpactMetrics(impact, locale, t);

  if (chips.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="chat-composer-impact-trigger"
          className="flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border/55 bg-background/72 px-1 text-left transition-[background-color,border-color] hover:border-primary/25 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          aria-label={t("impact.conversationLabel")}
        >
          {chips.map((metric) => {
            const Icon = metric.icon;
            return (
              <span
                key={metric.key}
                className="flex min-w-0 items-center gap-1 px-1 text-[11px] font-medium tabular-nums text-muted-foreground"
                aria-label={`${metric.label}: ${metric.value}`}
              >
                <Icon
                  className="size-3 shrink-0 text-primary/75"
                  aria-hidden="true"
                />
                <span className="truncate">{metric.value}</span>
              </span>
            );
          })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={t("impact.conversationLabel")}>
        <p className="mb-2 text-xs font-semibold tracking-[-0.01em] text-foreground">
          {t("impact.conversationLabel")}
        </p>
        <dl className="grid gap-1.5">
          {details.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.key}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-muted/40 px-2 py-1.5"
              >
                <Icon
                  className="size-3.5 shrink-0 text-primary/80"
                  aria-hidden="true"
                />
                <dt className="min-w-0">
                  <span className="block truncate text-xs text-foreground">
                    {metric.label}
                  </span>
                  {metric.description ? (
                    <span className="block text-[10px] leading-snug text-muted-foreground">
                      {metric.description}
                    </span>
                  ) : null}
                </dt>
                <dd className="font-mono text-xs tabular-nums text-foreground">
                  {metric.value}
                </dd>
              </div>
            );
          })}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
