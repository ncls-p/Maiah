"use client";

import { CircleDollarSignIcon, ZapIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ChatUsageImpact } from "@/components/chat/chat-types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ChatComposerImpact({ impact }: { impact: ChatUsageImpact }) {
  const t = useTranslations("chat");
  const metrics = [
    impact.cost === null
      ? null
      : {
          key: "cost",
          icon: CircleDollarSignIcon,
          value: `${impact.cost.toFixed(4)} ${impact.currency}`,
          label: t("impact.costLabel"),
          description: t("impact.costDescription"),
        },
    impact.energyKwh === null
      ? null
      : {
          key: "energy",
          icon: ZapIcon,
          value: `${impact.energyKwh.toFixed(4)} kWh`,
          label: t("impact.energyLabel"),
          description: t("impact.energyDescription"),
        },
  ].filter((metric): metric is NonNullable<typeof metric> => metric !== null);

  if (metrics.length === 0) return null;

  return (
    <TooltipProvider>
      <div
        className="flex min-w-0 flex-wrap items-center gap-1.5"
        aria-label={t("impact.conversationLabel")}
      >
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Tooltip key={metric.key}>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-border/55 bg-background/72 px-2 text-[11px] font-medium tabular-nums text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:flex-none"
                  aria-label={`${metric.label}: ${metric.value}`}
                >
                  <Icon
                    className="size-3 shrink-0 text-primary/75"
                    aria-hidden="true"
                  />
                  <span className="truncate">{metric.value}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>
                <span className="max-w-64">
                  <span className="font-medium">{metric.label}</span>
                  <span className="block opacity-80">{metric.description}</span>
                </span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
