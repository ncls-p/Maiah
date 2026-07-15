import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type WorkspacePageWidth = "narrow" | "default" | "wide" | "full";

const widthClass: Record<WorkspacePageWidth, string> = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
  full: "max-w-[90rem]",
};

export function WorkspacePage({
  title,
  description,
  width = "default",
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  width?: WorkspacePageWidth;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "page-content mx-auto flex min-h-full w-full flex-col gap-6 px-4 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-9",
        widthClass[width],
        className,
      )}
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-pretty text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-[1.75rem]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            data-slot="workspace-page-actions"
            className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center [&>[data-slot=button]]:w-full sm:[&>[data-slot=button]]:w-auto"
          >
            {actions}
          </div>
        ) : null}
      </header>
      <div className="page-content__body">{children}</div>
    </div>
  );
}
