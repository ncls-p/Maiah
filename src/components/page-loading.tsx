import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageLoading({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  const displayLabel = label.endsWith("…") ? label : `${label}…`;

  return (
    <div
      className={cn(
        "flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-3xl border border-transparent bg-card/60 shadow-[var(--surface-shadow)]",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_12%,transparent)]">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-muted-foreground">
        {displayLabel}
      </p>
    </div>
  );
}
