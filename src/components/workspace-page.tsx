import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type WorkspacePageWidth = "narrow" | "default" | "wide" | "full";

const widthClass: Record<WorkspacePageWidth, string> = {
	narrow: "max-w-3xl",
	default: "max-w-5xl",
	wide: "max-w-6xl",
	full: "max-w-7xl",
};

export function WorkspacePage({
	kicker,
	title,
	description,
	width = "default",
	actions,
	children,
	className,
}: {
	kicker?: string;
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
				"mx-auto flex min-h-full w-full flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-7",
				widthClass[width],
				className,
			)}
		>
			<header className="grid gap-4 border-b border-border/60 pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
				<div className="flex min-w-0 flex-col gap-2">
					{kicker ? <div className="section-kicker">{kicker}</div> : null}
					<h1 className="text-pretty text-2xl font-semibold tracking-tight">
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
						className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end [&>[data-slot=button]]:w-full sm:[&>[data-slot=button]]:w-auto"
					>
						{actions}
					</div>
				) : null}
			</header>
			{children}
		</div>
	);
}
