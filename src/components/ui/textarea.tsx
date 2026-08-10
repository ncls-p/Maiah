import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({
  className,
  id,
  name,
  ...props
}: React.ComponentProps<"textarea">) {
  const textareaName = name ?? (typeof id === "string" ? id : undefined);

  return (
    <textarea
      id={id}
      name={textareaName}
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-xl border border-input/80 bg-card/80 px-3.5 py-3 text-base shadow-[0_1px_2px_rgba(16,43,56,0.025)] transition-[background-color,border-color,box-shadow,color] duration-150 ease-out outline-none placeholder:text-muted-foreground/85 hover:border-input focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/15 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
