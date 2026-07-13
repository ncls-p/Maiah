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
        "page-content mx-auto flex min-h-full w-full flex-col gap-7 px-4 py-7 sm:gap-9 sm:px-7 sm:py-10 lg:px-10",
        widthClass[width],
        className,
      )}
    >
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <h1 className="text-pretty text-2xl font-semibold tracking-[-0.045em] text-foreground sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
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
