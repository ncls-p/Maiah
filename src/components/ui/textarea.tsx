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
				"flex field-sizing-content min-h-24 w-full rounded-xl border border-input bg-background/42 px-3.5 py-3 text-base shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.22)] backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-200 outline-none placeholder:text-muted-foreground/75 focus-visible:border-ring/55 focus-visible:bg-background/58 focus-visible:ring-3 focus-visible:ring-ring/18 disabled:cursor-not-allowed disabled:bg-input/45 disabled:opacity-50 aria-invalid:border-destructive/60 aria-invalid:ring-3 aria-invalid:ring-destructive/15 md:text-sm dark:bg-input/25 dark:disabled:bg-input/60 dark:aria-invalid:border-destructive/45 dark:aria-invalid:ring-destructive/25",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
