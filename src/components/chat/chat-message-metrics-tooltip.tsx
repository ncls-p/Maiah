"use client";

import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ChatMessageMetrics } from "@/components/chat/chat-types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { outputTokensPerSecond } from "@/modules/chat/message-metrics";

function formatDuration(durationMs: number, locale: string) {
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  const seconds = durationMs / 1_000;
  if (seconds < 60) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes} min ${remainingSeconds} s`;
}

export function ChatMessageMetricsTooltip({
  metrics,
  locale,
}: {
  metrics: ChatMessageMetrics;
  locale: string;
}) {
  const t = useTranslations("chat.messageList.metrics");
  const formatInteger = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  });
  const tokensPerSecond = outputTokensPerSecond(metrics);
  const rows = [
    metrics.inputTokens === undefined
      ? null
      : [t("inputTokens"), formatInteger.format(metrics.inputTokens)],
    metrics.outputTokens === undefined
      ? null
      : [t("outputTokens"), formatInteger.format(metrics.outputTokens)],
    metrics.totalTokens === undefined
      ? null
      : [t("totalTokens"), formatInteger.format(metrics.totalTokens)],
    metrics.cacheReadTokens === undefined
      ? null
      : [t("cacheReadTokens"), formatInteger.format(metrics.cacheReadTokens)],
    metrics.cacheWriteTokens === undefined
      ? null
      : [t("cacheWriteTokens"), formatInteger.format(metrics.cacheWriteTokens)],
    metrics.reasoningTokens === undefined
      ? null
      : [t("reasoningTokens"), formatInteger.format(metrics.reasoningTokens)],
    metrics.durationMs === undefined
      ? null
      : [t("duration"), formatDuration(metrics.durationMs, locale)],
    tokensPerSecond === undefined
      ? null
      : [
          t("tokensPerSecond"),
          new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
            tokensPerSecond,
          ),
        ],
  ].filter((row): row is [string, string] => row !== null);

  if (rows.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("label")}
          className="-my-2 inline-flex size-10 items-center justify-center rounded-full text-muted-foreground/55 outline-none transition-[background-color,color,scale] duration-150 hover:bg-muted/60 hover:text-muted-foreground focus-visible:bg-muted/60 focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[0.96]"
        >
          <InfoIcon className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="block min-w-52 px-3 py-2.5"
      >
        <span className="mb-2 block font-medium">{t("title")}</span>
        <span className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1 tabular-nums">
          {rows.map(([label, value]) => (
            <span key={label} className="contents">
              <span className="opacity-75">{label}</span>
              <span className="text-right font-medium">{value}</span>
            </span>
          ))}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
