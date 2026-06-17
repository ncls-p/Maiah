"use client";

import { Link, usePathname } from "@/i18n/navigation";
import {
	ChevronDownIcon,
	CheckIcon,
	MoreHorizontalIcon,
	MessageSquareIcon,
	PanelLeftCloseIcon,
	PanelLeftOpenIcon,
	PencilIcon,
	PlusIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { ChatAgent, ChatConversation } from "@/components/chat/chat-types";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	isNavItemActive,
	type NavGroup,
	type NavItem,
	type WorkspaceShellState,
} from "@/lib/workspace-nav";
import { buildMenuGroups } from "@/modules/navigation/sidebar-config";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
	agents: ChatAgent[];
	conversations: ChatConversation[];
	activeConversationId: string | null;
	loading?: boolean;
	onSelectConversation: (conversationId: string) => void;
	onNewConversation: () => void;
	onRenameConversation?: (conversationId: string, title: string) => void;
	onDeleteConversation?: (conversationId: string) => void;
	hasMoreConversations?: boolean;
	loadingMoreConversations?: boolean;
	onLoadMoreConversations?: () => void;
	collapsed?: boolean;
	onCollapsedChange?: (collapsed: boolean) => void;
	className?: string;
	showThemeToggle?: boolean;
	shell?: WorkspaceShellState;
}

function formatRelativeTime(dateStr: string): string {
	const now = new Date();
	const date = new Date(dateStr);
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ChatNavLink({ item }: { item: NavItem }) {
	const pathname = usePathname();
	const t = useTranslations("nav");
	const Icon = item.icon;
	const label = t(item.labelKey);
	const active = isNavItemActive(pathname, item.href);

	return (
		<Link
			href={item.href}
			aria-current={active ? "page" : undefined}
			className={cn(
				"flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
				active
					? "bg-sidebar-accent text-sidebar-accent-foreground"
					: "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
			)}
		>
			<Icon className="size-4 shrink-0" aria-hidden="true" />
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{item.badge && item.badge > 0 ? (
				<Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
					{item.badge}
				</Badge>
			) : null}
		</Link>
	);
}

function ChatAppNavigation({ groups }: { groups: NavGroup[] }) {
	const tGroups = useTranslations("nav.groups");
	const [open, setOpen] = useState(false);
	const primaryItems = groups
		.filter((group) => group.labelKey !== "advanced")
		.flatMap((group) => group.items)
		.filter((item) => item.href !== "/chat")
		.slice(0, 6);
	const advancedItems = groups
		.find((group) => group.labelKey === "advanced")
		?.items.filter((item) => item.href !== "/chat");

	if (
		primaryItems.length === 0 &&
		(!advancedItems || advancedItems.length === 0)
	) {
		return null;
	}

	return (
		<div className="border-t border-sidebar-border px-3 py-3">
			<p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
				Workspace
			</p>
			<div className="flex flex-col gap-1">
				{primaryItems.map((item) => (
					<ChatNavLink key={item.href} item={item} />
				))}
			</div>
			{advancedItems && advancedItems.length > 0 ? (
				<Collapsible open={open} onOpenChange={setOpen}>
					<CollapsibleTrigger asChild>
						<button
							type="button"
							className="mt-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
						>
							<span>{tGroups("advanced")}</span>
							<ChevronDownIcon
								className={cn(
									"size-3.5 transition-transform",
									open && "rotate-180",
								)}
								aria-hidden="true"
							/>
						</button>
					</CollapsibleTrigger>
					<CollapsibleContent className="mt-1 flex flex-col gap-1">
						{advancedItems.map((item) => (
							<ChatNavLink key={item.href} item={item} />
						))}
					</CollapsibleContent>
				</Collapsible>
			) : null}
		</div>
	);
}

function ConversationItem({
	conversation,
	isActive,
	isEditing,
	editingTitle,
	agentName,
	onSelect,
	onRename,
	onDelete,
	onEditStart,
	onEditChange,
	onEditCancel,
}: {
	conversation: ChatConversation;
	isActive: boolean;
	isEditing: boolean;
	editingTitle: string;
	agentName: string;
	onSelect: () => void;
	onRename: (title: string) => void;
	onDelete: () => void;
	onEditStart: () => void;
	onEditChange: (title: string) => void;
	onEditCancel: () => void;
}) {
	return (
		<div
			className={cn(
				"group/conversation relative overflow-hidden rounded-lg border transition-colors",
				isActive
					? "border-input bg-muted"
					: "border-transparent hover:border-border hover:bg-muted/70",
			)}
		>
			{/* Active indicator bar */}
			{isActive && (
				<div className="absolute left-1 top-1/2 h-4 w-px -translate-y-1/2 rounded-full bg-foreground" />
			)}

			{isEditing ? (
				<div className="flex min-w-0 flex-1 items-center gap-1 p-1 pl-2.5">
					<Input
						value={editingTitle}
						onChange={(event) => onEditChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								const nextTitle = editingTitle.trim();
								if (nextTitle) {
									onRename(nextTitle);
								}
							}
							if (event.key === "Escape") {
								onEditCancel();
							}
						}}
						className="h-7 min-w-0 rounded-md px-2 text-xs"
						autoFocus
					/>
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						aria-label="Save title"
						className="size-6 shrink-0 rounded-md"
						onClick={() => {
							const nextTitle = editingTitle.trim();
							if (!nextTitle) return;
							onRename(nextTitle);
						}}
					>
						<CheckIcon className="size-3" aria-hidden="true" />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						aria-label="Cancel title edit"
						className="size-6 shrink-0 rounded-md"
						onClick={onEditCancel}
					>
						<XIcon className="size-3" aria-hidden="true" />
					</Button>
				</div>
			) : (
				<div className="flex items-center gap-0.5 px-2.5 py-1.5">
					<button
						type="button"
						onClick={onSelect}
						className="min-w-0 flex-1 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40"
					>
						<span
							className={cn(
								"block truncate text-xs leading-tight transition-colors",
								isActive ? "font-semibold text-foreground" : "font-medium",
							)}
						>
							{conversation.title}
						</span>
						<span className="mt-0.5 flex items-center gap-1 text-[11px] leading-none text-muted-foreground/50">
							<span className="truncate">{agentName}</span>
							<span className="shrink-0 text-muted-foreground/25">·</span>
							<span className="shrink-0">
								{formatRelativeTime(conversation.updatedAt)}
							</span>
						</span>
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								aria-label="Conversation actions"
								className={cn(
									"size-6 shrink-0 rounded-md opacity-0 transition-opacity hover:bg-background md:group-hover/conversation:opacity-100 data-[state=open]:opacity-100",
									isActive && "opacity-100",
								)}
							>
								<MoreHorizontalIcon className="size-3" aria-hidden="true" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuGroup>
								<DropdownMenuItem onSelect={onEditStart} className="gap-2">
									<PencilIcon className="size-3.5" aria-hidden="true" />
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									onSelect={onDelete}
									className="gap-2"
								>
									<Trash2Icon className="size-3.5" aria-hidden="true" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			)}
		</div>
	);
}

export function ChatSidebar({
	agents,
	conversations,
	activeConversationId,
	loading,
	onSelectConversation,
	onNewConversation,
	onRenameConversation,
	onDeleteConversation,
	hasMoreConversations,
	loadingMoreConversations,
	onLoadMoreConversations,
	collapsed,
	onCollapsedChange,
	className,
	showThemeToggle,
	shell,
}: ChatSidebarProps) {
	const [editingConversationId, setEditingConversationId] = useState<
		string | null
	>(null);
	const [editingTitle, setEditingTitle] = useState("");
	const agentNameById = useMemo(
		() => new Map(agents.map((agent) => [agent.id, agent.name])),
		[agents],
	);
	const navGroups = useMemo(
		() => (shell ? buildMenuGroups(shell) : []),
		[shell],
	);

	if (collapsed) {
		return (
			<div
				className={cn(
					"flex h-full min-h-0 flex-col items-center gap-1.5 py-3",
					className,
				)}
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label="Expand chat sidebar"
							onClick={() => onCollapsedChange?.(false)}
							className="size-9 rounded-lg transition-all duration-200 hover:bg-muted"
						>
							<PanelLeftOpenIcon className="size-4" aria-hidden="true" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">Expand sidebar</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label="New conversation"
							onClick={onNewConversation}
							className="size-9 rounded-lg"
						>
							<PlusIcon className="size-4" aria-hidden="true" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">New chat</TooltipContent>
				</Tooltip>
				<div className="mt-1 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
					{conversations.slice(0, 10).map((conversation) => (
						<Tooltip key={conversation.id}>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="icon"
									variant={
										activeConversationId === conversation.id
											? "secondary"
											: "ghost"
									}
									aria-label={conversation.title}
									onClick={() => onSelectConversation(conversation.id)}
									className={cn(
										"size-9 rounded-lg transition-colors",
										activeConversationId === conversation.id &&
											"bg-muted text-foreground",
									)}
								>
									<MessageSquareIcon className="size-4" aria-hidden="true" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">{conversation.title}</TooltipContent>
						</Tooltip>
					))}
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex h-full min-h-0 flex-col rounded-none bg-sidebar text-sidebar-foreground",
				className,
			)}
		>
			<div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
				<div className="flex items-center gap-2">
					{onCollapsedChange ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									aria-label="Collapse chat sidebar"
									onClick={() => onCollapsedChange(true)}
									className="size-7 rounded-md"
								>
									<PanelLeftCloseIcon className="size-3.5" aria-hidden="true" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Collapse sidebar</TooltipContent>
						</Tooltip>
					) : null}
					<div className="flex size-6 items-center justify-center rounded-md border bg-muted text-muted-foreground">
						<MessageSquareIcon className="size-3" aria-hidden="true" />
					</div>
					<span className="text-sm font-semibold tracking-tight">Chat</span>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onNewConversation}
					className="h-8 gap-1 rounded-lg px-3 text-xs font-medium"
				>
					<PlusIcon className="size-3" aria-hidden="true" />
					New
				</Button>
			</div>

			{/* Scrollable content */}
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
				<div className="flex items-center justify-between px-2 py-1.5">
					<span className="text-[11px] font-medium text-muted-foreground">
						Conversations
					</span>
					{conversations.length > 0 ? (
						<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
							{conversations.length}
							{hasMoreConversations ? "+" : ""}
						</span>
					) : null}
				</div>
				<div className="flex min-h-0 flex-col gap-1">
					{loading ? (
						<div className="flex flex-col gap-px pt-px">
							<Skeleton className="h-8 w-full rounded" />
							<Skeleton className="h-8 w-full rounded" />
							<Skeleton className="h-8 w-full rounded" />
						</div>
					) : conversations.length === 0 ? (
						<div className="pt-2">
							<Empty className="border border-dashed py-8">
								<EmptyHeader>
									<EmptyMedia
										variant="icon"
										className="text-muted-foreground/40"
									>
										<MessageSquareIcon className="size-5" aria-hidden="true" />
									</EmptyMedia>
									<EmptyTitle className="text-sm font-medium">
										No conversations yet
									</EmptyTitle>
									<EmptyDescription className="text-xs text-muted-foreground/60">
										Start a new chat to begin.
									</EmptyDescription>
								</EmptyHeader>
								<div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
									<Button
										asChild
										variant="link"
										size="sm"
										className="h-auto px-0 text-muted-foreground/70"
									>
										<Link href="/providers">Configure a provider</Link>
									</Button>
									<Button
										asChild
										variant="link"
										size="sm"
										className="h-auto px-0 text-muted-foreground/70"
									>
										<Link href="/agents">Create an agent</Link>
									</Button>
								</div>
							</Empty>
						</div>
					) : (
						<div className="flex flex-col gap-px">
							{conversations.map((conversation) => {
								const isActive = activeConversationId === conversation.id;
								const isEditing = editingConversationId === conversation.id;
								const agentName =
									agentNameById.get(conversation.agentId) ?? "Assistant";

								return (
									<ConversationItem
										key={conversation.id}
										conversation={conversation}
										isActive={isActive}
										isEditing={isEditing}
										editingTitle={isEditing ? editingTitle : ""}
										agentName={agentName}
										onSelect={() => onSelectConversation(conversation.id)}
										onRename={(title) => {
											onRenameConversation?.(conversation.id, title);
											setEditingConversationId(null);
										}}
										onDelete={() => onDeleteConversation?.(conversation.id)}
										onEditStart={() => {
											setEditingConversationId(conversation.id);
											setEditingTitle(conversation.title);
										}}
										onEditChange={setEditingTitle}
										onEditCancel={() => setEditingConversationId(null)}
									/>
								);
							})}
							{hasMoreConversations && onLoadMoreConversations ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="mt-2 h-8 rounded-lg text-xs text-muted-foreground"
									disabled={loadingMoreConversations}
									onClick={onLoadMoreConversations}
								>
									{loadingMoreConversations ? "Loading…" : "Load older chats"}
								</Button>
							) : null}
						</div>
					)}
				</div>
			</div>

			{navGroups.length > 0 ? <ChatAppNavigation groups={navGroups} /> : null}

			{/* Footer */}
			{showThemeToggle ? (
				<div className="border-t border-border/50 p-3">
					<ThemeToggleButton className="w-full" />
				</div>
			) : null}
		</div>
	);
}
