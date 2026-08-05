import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ConfigSection({
  title,
  description,
  children,
  icon: Icon,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
  /** Deprecated: animation stagger is no longer applied */
  stagger?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-[1.125rem] border border-border/65 bg-card/85 shadow-[var(--surface-shadow)]", className)}>
      <header className="flex items-start gap-3 border-b border-border/55 px-4 py-3.5 sm:px-5">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0 pt-0.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p> : null}
        </div>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
