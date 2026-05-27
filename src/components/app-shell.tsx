"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	BookOpenIcon,
	BotIcon,
	LogInIcon,
	MenuIcon,
	MessageSquareIcon,
	MessageSquarePlusIcon,
	PlugZapIcon,
	SettingsIcon,
	UsersIcon,
} from "lucide-react";

import { DeodisLogo } from "@/components/deodis-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface AppShellProps {
	children: React.ReactNode;
	displayName?: string;
	isAdmin?: boolean;
}

const mainNavItems = [
	{ href: "/chat", label: "Chat", icon: MessageSquareIcon },
	{ href: "/agents", label: "Agents", icon: BotIcon },
	{ href: "/knowledge", label: "Knowledge", icon: BookOpenIcon },
	{ href: "/providers", label: "Providers", icon: PlugZapIcon },
] as const;

const adminNavItems = [
	{ href: "/members", label: "Team", icon: UsersIcon },
	{ href: "/settings", label: "Admin", icon: SettingsIcon },
] as const;

function NavLink({
	href,
	label,
	icon: Icon,
}: {
	href: string;
	label: string;
	icon: typeof MessageSquareIcon;
}) {
	const pathname = usePathname();
	const isActive = pathname === href || pathname.startsWith(`${href}/`);

	return (
		<Link
			href={href}
			className={cn(
				"flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
				isActive
					? "bg-primary/10 text-foreground"
					: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
			)}
		>
			<Icon className="size-4" aria-hidden="true" />
			{label}
		</Link>
	);
}

function SidebarContent({
	displayName,
	isAdmin,
}: {
	displayName?: string;
	isAdmin?: boolean;
}) {
	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<div className="flex items-center justify-between gap-2 px-1 py-1">
				<DeodisLogo href="/chat" className="h-7" />
			</div>

			<Button
				asChild
				className="h-10 justify-start rounded-xl"
				variant="outline"
			>
				<Link href="/chat">
					<MessageSquarePlusIcon data-icon="inline-start" aria-hidden="true" />
					New chat
				</Link>
			</Button>

			<nav className="flex flex-col gap-1" aria-label="Main navigation">
				{mainNavItems.map((item) => (
					<NavLink key={item.href} {...item} />
				))}
				{isAdmin
					? adminNavItems.map((item) => <NavLink key={item.href} {...item} />)
					: null}
			</nav>

			<div className="min-h-0 flex-1" />

			<div className="flex flex-col gap-2 border-t border-border/70 pt-3">
				<ThemeToggleButton />
				{displayName ? (
					<>
						<div className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
							<p className="truncate font-medium text-foreground">
								{displayName}
							</p>
							<p className="text-xs text-muted-foreground">Workspace</p>
						</div>
						<SignOutButton />
					</>
				) : (
					<Button asChild size="sm" className="justify-start rounded-xl">
						<Link href="/auth/signin">
							<LogInIcon data-icon="inline-start" aria-hidden="true" />
							Sign in
						</Link>
					</Button>
				)}
			</div>
		</div>
	);
}

export function AppShell({ children, displayName, isAdmin }: AppShellProps) {
	return (
		<div
			data-page="app-shell"
			className="flex h-svh min-h-svh bg-background text-foreground"
		>
			<aside className="hidden w-56 shrink-0 border-r border-border/70 bg-card/45 backdrop-blur-xl lg:block">
				<SidebarContent displayName={displayName} isAdmin={isAdmin} />
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl lg:hidden">
					<Sheet>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon-sm" aria-label="Open menu">
								<MenuIcon aria-hidden="true" />
							</Button>
						</SheetTrigger>
						<SheetContent side="left" className="w-[min(100vw-2rem,18rem)] p-0">
							<SheetHeader className="sr-only">
								<SheetTitle>Navigation</SheetTitle>
							</SheetHeader>
							<SidebarContent displayName={displayName} isAdmin={isAdmin} />
						</SheetContent>
					</Sheet>
					<Link href="/chat" className="text-sm font-semibold">
						AI Hub
					</Link>
					<Button asChild variant="ghost" size="icon-sm" aria-label="New chat">
						<Link href="/chat">
							<MessageSquarePlusIcon aria-hidden="true" />
						</Link>
					</Button>
				</header>

				<main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
			</div>
		</div>
	);
}
