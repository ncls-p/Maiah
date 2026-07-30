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
  accentTitle,
  eyebrow,
  description,
  width = "default",
  actions,
  children,
  className,
  headerVariant = "editorial",
}: {
  title: string;
  accentTitle?: string;
  eyebrow?: string;
  description?: string;
  width?: WorkspacePageWidth;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerVariant?: "editorial" | "compact";
}) {
  const compact = headerVariant === "compact";

  return (
    <div
      className={cn(
        "page-content mx-auto flex min-h-full w-full flex-col px-4 sm:px-7 lg:px-10",
        compact ? "gap-5 py-5 sm:py-7 lg:py-8" : "gap-8 py-7 sm:py-10 lg:py-12",
        widthClass[width],
        className,
      )}
    >
      <header
        className={cn(
          "flex flex-col sm:flex-row sm:justify-between",
          compact ? "gap-3 sm:items-center" : "gap-5 sm:items-end",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="workspace-page-kicker" aria-hidden="true">
            {eyebrow ?? `Maiah / ${title}`}
          </span>
          <h1
            className={cn(
              "workspace-page-heading text-pretty text-foreground",
              compact
                ? "text-[2rem] leading-none sm:text-[2.4rem]"
                : "text-[2.35rem] leading-[0.98] sm:text-[3.15rem]",
            )}
          >
            {title}
            {accentTitle ? (
              <>
                <br />
                <em className="font-normal text-primary">{accentTitle}</em>
              </>
            ) : null}
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
