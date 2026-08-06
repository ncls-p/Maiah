"use client";

import { CircleHelpIcon } from "lucide-react";
import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";

import { Tooltip,TooltipContent,TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type LabelProps = React.ComponentProps<typeof LabelPrimitive.Root> & {
  /** Short, plain-language explanation shown on hover and keyboard focus. */
  help?: React.ReactNode;
  "data-slot"?: string;
};

function Label({ className, children, help, "data-slot": dataSlot = "label", ...props }: LabelProps) {
  const classes = cn("flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50", className);

  if (!help) {
    return (
      <LabelPrimitive.Root data-slot={dataSlot} className={classes} {...props}>
        {children}
      </LabelPrimitive.Root>
    );
  }

  return (
    <span data-slot={dataSlot} className={classes}>
      <LabelPrimitive.Root data-slot="label-control" className="contents" {...props}>
        {children}
      </LabelPrimitive.Root>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label={typeof help === "string" ? help : undefined} className="inline-flex size-6 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <CircleHelpIcon className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-72 text-pretty text-xs leading-5">
          {help}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

export { Label };
