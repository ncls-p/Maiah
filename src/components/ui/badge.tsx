import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold tracking-wide whitespace-nowrap uppercase shadow-[inset_0_1px_0_oklch(1_0_0_/_0.16)] backdrop-blur-sm transition-[background-color,border-color,color,box-shadow,opacity] duration-200 focus-visible:border-ring/60 focus-visible:ring-[3px] focus-visible:ring-ring/25 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive/60 aria-invalid:ring-destructive/15 dark:aria-invalid:ring-destructive/25 [&>svg]:pointer-events-none [&>svg]:size-3!",
	{
		variants: {
			variant: {
				default:
					"border-primary/18 bg-primary/10 text-primary [a]:hover:bg-primary/16",
				secondary:
					"border-border/50 bg-secondary/58 text-secondary-foreground [a]:hover:bg-secondary/75",
				destructive:
					"border-destructive/20 bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
				outline:
					"border-border/50 bg-background/38 text-foreground [a]:hover:bg-muted/58 [a]:hover:text-foreground",
				ghost:
					"hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
				link: "text-primary underline-offset-4 hover:underline",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant = "default",
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot.Root : "span";

	return (
		<Comp
			data-slot="badge"
			data-variant={variant}
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge };
