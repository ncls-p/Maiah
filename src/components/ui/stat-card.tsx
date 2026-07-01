import type { ElementType } from "react";
import { cn } from "@/lib/utils";

const defaultStyles = {
  container:
    "group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/35",
  accentBar:
    "absolute left-0 top-0 h-full w-1 opacity-60 transition-opacity duration-300 group-hover:opacity-100",
  value: "text-2xl font-bold tracking-tight text-foreground",
  iconContainer:
    "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
} as const;

const usageStyles = {
  container:
    "group relative overflow-hidden rounded-2xl border border-transparent bg-card p-4 shadow-[var(--surface-shadow)] transition-[background-color,box-shadow] duration-150 ease-out hover:shadow-[var(--surface-shadow-hover)]",
  accentBar:
    "absolute top-0 left-0 h-full w-1 opacity-70 transition-opacity duration-150 ease-out group-hover:opacity-100",
  value: "text-2xl font-bold tabular-nums tracking-tight text-foreground",
  iconContainer:
    "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 ease-out group-hover:scale-[1.03]",
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
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
