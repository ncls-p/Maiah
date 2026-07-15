import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function PageLoading({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[18rem] w-full flex-col gap-6 rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--surface-shadow)]",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-40 max-w-[55%]" />
          <Skeleton className="h-3 w-64 max-w-[80%]" />
        </div>
      </div>
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <Skeleton className="min-h-36 rounded-xl" />
        <Skeleton className="min-h-36 rounded-xl" />
      </div>
    </div>
  );
}
