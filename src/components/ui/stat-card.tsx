import type { ElementType } from "react";
import { cn } from "@/lib/utils";

const defaultStyles = {
  container:
    "group relative overflow-hidden rounded-3xl border border-transparent bg-card p-5 shadow-[var(--surface-shadow)] transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:shadow-[var(--surface-shadow-hover)]",
  accentBar:
    "absolute inset-x-5 top-0 h-0.5 rounded-full opacity-70 transition-opacity duration-200 group-hover:opacity-100",
  value:
    "text-2xl font-semibold tabular-nums tracking-[-0.04em] text-foreground",
  iconContainer:
    "flex size-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-[1.03]",
} as const;

const usageStyles = {
  container:
    "group relative overflow-hidden rounded-3xl border border-transparent bg-card p-5 shadow-[var(--surface-shadow)] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:shadow-[var(--surface-shadow-hover)]",
  accentBar:
    "absolute inset-x-5 top-0 h-0.5 rounded-full opacity-70 transition-opacity duration-150 ease-out group-hover:opacity-100",
  value:
    "text-2xl font-semibold tabular-nums tracking-[-0.04em] text-foreground",
  iconContainer:
    "flex size-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-150 ease-out group-hover:scale-[1.03]",
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  accent,
  variant = "default",
}: {
  label: string;
  value: string | number;
  icon: ElementType;
  color: string;
  accent: string;
  variant?: "default" | "usage";
}) {
  const styles = variant === "usage" ? usageStyles : defaultStyles;

  return (
    <div className={styles.container}>
      <div className={cn(styles.accentBar, accent)} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <span className={styles.value}>{value}</span>
        </div>
        <div className={cn(styles.iconContainer, color)}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
