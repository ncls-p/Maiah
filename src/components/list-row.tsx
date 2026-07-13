import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ListRowProps = ComponentProps<"div"> & {
  selected?: boolean;
  children: ReactNode;
};

export function ListRow({
  selected = false,
  className,
  children,
  ...props
}: ListRowProps) {
  return (
    <div
      data-slot="list-row"
      className={cn(
        "ui-list-row flex items-center gap-3.5 p-3.5",
        selected &&
          "border-transparent bg-accent/65 shadow-[var(--surface-shadow-hover)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
