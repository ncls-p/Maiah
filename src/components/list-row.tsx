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
				"ui-list-row flex items-center gap-3 p-3",
				selected &&
					"border-primary/25 bg-primary/8 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.18)]",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

type ListRowButtonProps = ComponentProps<"button"> & {
	selected?: boolean;
	children: ReactNode;
};

export function ListRowButton({
	selected = false,
	className,
	children,
	type = "button",
	...props
}: ListRowButtonProps) {
	return (
		<button
			type={type}
			data-slot="list-row-button"
			className={cn(
				"ui-list-row flex w-full items-center gap-3 p-3 text-left text-sm transition-all duration-200",
				selected &&
					"border-primary/25 bg-primary/8 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.18)]",
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}
