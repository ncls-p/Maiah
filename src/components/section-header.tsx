import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  description,
  className,
  actions,
}: {
  title: string;
  description?: string;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-balance text-base font-semibold tracking-[-0.025em]">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
