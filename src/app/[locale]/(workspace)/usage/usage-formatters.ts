import type { UsageCost } from "./usage-types";

export function formatCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatFullCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatLatency(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatCosts(costs: UsageCost[], locale: string) {
  if (costs.length === 0) return "—";
  return costs
    .map(({ currency, amount }) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: amount < 1 ? 4 : 2,
      }).format(amount),
    )
    .join(" · ");
}

export function successRate(events: number, failedEvents: number) {
  if (events === 0) return 100;
  return Math.max(0, ((events - failedEvents) / events) * 100);
}
