"use client";

import { useState, type ElementType, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function AdvancedSection({
  children,
  label,
  hint,
  icon: Icon,
  className,
}: {
  children: ReactNode;
  label: string;
  hint?: string;
  icon?: ElementType;
  /** Kept for API compatibility; advanced sections are intentionally closed by default. */
  storageKey?: string;
  /** Kept for API compatibility; advanced sections are intentionally closed by default. */
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(shouldOpen: boolean) {
    setOpen(shouldOpen);
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      data-open={String(open)}
      className={cn(
        "t-acc rounded-2xl border border-border/70 bg-card",
        className,
      )}
    >
      <CollapsibleTrigger
        aria-expanded={open}
        className="t-acc-head flex w-full cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          ) : null}
          <span className="truncate">{label}</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {!open && hint ? (
            <span className="hidden sm:inline">{hint}</span>
          ) : null}
          <span className="t-acc-chevron" aria-hidden="true">
            <ChevronDownIcon className="size-4 shrink-0" />
          </span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="t-acc-panel">
        <div className="t-acc-panel-inner border-t px-4 pb-4 pt-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
