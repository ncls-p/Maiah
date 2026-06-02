"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
	BotIcon,
	PlusIcon,
	TrashIcon,
	SearchIcon,
	Loader2,
	SparklesIcon,
	WrenchIcon,
	BookOpenIcon,
	ServerIcon,
	ClockIcon,
	ShieldIcon,
	UsersIcon,
	GlobeIcon,
	StarIcon,
} from "lucide-react";

import { PageLoading } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Agent {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	activeVersionId: string | null;
	sharingMode: "personal" | "marketplace" | "specific_user";
	isGlobal: boolean;
	isRecommended: boolean;
	curationLabel: string | null;
	createdAt: string;
	updatedAt: string;
}

type AgentBindingSummary = {
	toolCount: number;
	knowledgeCount: number;
	mcpCount: number;
};

function slugifyAgentName(value: string) {
	return (
		value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 64) || "assistant"
	);
}

function timeAgo(dateString: string): string {
	const now = new Date();
	const date = new Date(dateString);
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
	return date.toLocaleDateString();
}

const AVATAR_COLORS = [
	"from-violet-500 to-indigo-600",
	"from-cyan-500 to-blue-600",
	"from-emerald-500 to-teal-600",
	"from-amber-500 to-orange-600",
	"from-rose-500 to-pink-600",
	"from-fuchsia-500 to-purple-600",
	"from-lime-500 to-green-600",
	"from-sky-500 to-cyan-600",
];

function getAvatarColor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export default function AgentsPage() {
	const router = useRouter();
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(true);
	const [canAdminCurate, setCanAdminCurate] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
	const [creating, setCreating] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [form, setForm] = useState({
		name: "",
		slug: "",
		description: "",
		sharingMode: "personal" as Agent["sharingMode"],
		shareTargetEmail: "",
		isGlobal: false,
		isRecommended: false,
		curationLabel: "none",
	});
	const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [bindingSummaries, setBindingSummaries] = useState<
		Record<string, AgentBindingSummary>
	>({});
	const abortRef = useRef<AbortController | null>(null);

	const loadBindingSummaries = async (
		agentList: Agent[],
		currentWorkspaceId: string,
	) => {
		const summaries = await Promise.all(
			agentList.map(async (agent) => {
				const [toolsRes, knowledgeRes] = await Promise.all([
					fetch(
						`/api/workspace/agents/${agent.id}/tools?workspaceId=${currentWorkspaceId}`,
					),
					fetch(
						`/api/workspace/agents/${agent.id}/knowledge?workspaceId=${currentWorkspaceId}`,
					),
				]);
				const tools = toolsRes.ok ? await toolsRes.json() : [];
				const knowledge = knowledgeRes.ok
					? ((await knowledgeRes.json()) as { bindings?: unknown[] }).bindings
					: [];
				const toolList = Array.isArray(tools) ? tools : [];
				const mcpCount = toolList.filter(
					(tool) =>
						typeof tool === "object" &&
						tool !== null &&
						"toolSource" in tool &&
						(tool as { toolSource: string }).toolSource === "mcp",
				).length;
				return {
					agentId: agent.id,
					toolCount: toolList.length,
					knowledgeCount: Array.isArray(knowledge) ? knowledge.length : 0,
					mcpCount,
				};
			}),
		);
		setBindingSummaries(
			Object.fromEntries(
				summaries.map((summary) => [
					summary.agentId,
					{
						toolCount: summary.toolCount,
						knowledgeCount: summary.knowledgeCount,
						mcpCount: summary.mcpCount,
					},
				]),
			),
		);
	};

	const refreshAgents = async () => {
		if (!workspaceId) return;
		abortRef.current?.abort();
		abortRef.current = new AbortController();
		try {
			const res = await fetch(
				`/api/workspace/agents?workspaceId=${workspaceId}`,
				{
					signal: abortRef.current.signal,
				},
			);
			if (!res.ok) throw new Error("Failed to fetch agents");
			const data = await res.json();
			const nextAgents = Array.isArray(data) ? data : data.agents;
			setAgents(nextAgents);
			setCanAdminCurate(Boolean(data.canAdminCurate));
			void loadBindingSummaries(nextAgents, workspaceId);
		} catch (err) {
			if (err instanceof Error && err.name !== "AbortError") {
				console.error("Failed to load agents", err);
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (!workspaceId) return;
		const currentWorkspaceId = workspaceId;
		let cancelled = false;
		const controller = new AbortController();

		async function loadInitialAgents() {
			try {
				const res = await fetch(
					`/api/workspace/agents?workspaceId=${currentWorkspaceId}`,
					{ signal: controller.signal },
				);
				if (!res.ok) throw new Error("Failed to load agents");
				const data = await res.json();
				if (!cancelled) {
					const nextAgents = Array.isArray(data) ? data : data.agents;
					setAgents(nextAgents);
					setCanAdminCurate(Boolean(data.canAdminCurate));
					void loadBindingSummaries(nextAgents, currentWorkspaceId);
				}
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					console.error("Failed to load agents", err);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		void loadInitialAgents();
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [workspaceId]);

	const handleCreate = async () => {
		if (!workspaceId || !form.name.trim()) return;
		const slug = form.slug.trim() || slugifyAgentName(form.name);
		setCreating(true);
		try {
			const res = await fetch("/api/workspace/agents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: form.name.trim(),
					slug,
					description: form.description.trim() || undefined,
					workspaceId,
					sharingMode: form.sharingMode,
					shareTargetEmail:
						form.sharingMode === "specific_user"
							? form.shareTargetEmail.trim()
							: undefined,
					isGlobal: canAdminCurate ? form.isGlobal : undefined,
					isRecommended: canAdminCurate ? form.isRecommended : undefined,
					curationLabel: canAdminCurate ? form.curationLabel : undefined,
				}),
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Failed to create agent");
			}

			toast.success("Agent created");
			setShowCreateDialog(false);
			setForm({
				name: "",
				slug: "",
				description: "",
				sharingMode: "personal",
				shareTargetEmail: "",
				isGlobal: false,
				isRecommended: false,
				curationLabel: "none",
			});
			await refreshAgents();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create agent",
			);
		} finally {
			setCreating(false);
		}
	};

	const handleDelete = async () => {
		if (!workspaceId || !deleteAgentId) return;
		setDeleting(true);
		try {
			const res = await fetch(
				`/api/workspace/agents/${deleteAgentId}?workspaceId=${workspaceId}`,
				{
					method: "DELETE",
				},
			);

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Failed to delete agent");
			}

			toast.success("Agent deleted");
			setDeleteAgentId(null);
			await refreshAgents();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to delete agent",
			);
		} finally {
			setDeleting(false);
		}
	};

	const filteredAgents = agents.filter((agent) => {
		if (!searchQuery.trim()) return true;
		const q = searchQuery.toLowerCase();
		return (
			agent.name.toLowerCase().includes(q) ||
			(agent.description ?? "").toLowerCase().includes(q) ||
			agent.slug.toLowerCase().includes(q)
		);
	});

	if (workspaceLoading || !workspaceId) {
		return <PageLoading label="Loading workspace" />;
	}

	return (
		<WorkspacePage
			kicker="Configuration"
			title="Assistants"
			description="Manage your AI assistants — each one can have its own model, system prompt, tools, and knowledge bases."
			width="default"
			actions={
				<Button type="button" onClick={() => setShowCreateDialog(true)}>
					<PlusIcon data-icon="inline-start" aria-hidden="true" />
					New assistant
				</Button>
			}
		>
			<Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Create assistant</DialogTitle>
						<DialogDescription>
							Give your assistant a name and optional description. Bind a model,
							tools, and knowledge after creation.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="agent-name">Name</Label>
							<Input
								id="agent-name"
								placeholder="My Assistant…"
								value={form.name}
								onChange={(e) =>
									setForm({
										...form,
										name: e.target.value,
										slug: slugifyAgentName(e.target.value),
									})
								}
								autoFocus
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="agent-description">Description (optional)</Label>
							<Textarea
								id="agent-description"
								placeholder="A helpful assistant for…"
								value={form.description}
								onChange={(e) =>
									setForm({
										...form,
										description: e.target.value,
									})
								}
							/>
						</div>
						<Button
							type="button"
							variant="ghost"
							className="justify-start px-0"
							onClick={() => setShowAdvancedCreate((value) => !value)}
						>
							{showAdvancedCreate
								? "Hide advanced settings"
								: "Advanced settings"}
						</Button>
						{showAdvancedCreate ? (
							<>
								<div className="flex flex-col gap-2">
									<Label htmlFor="agent-slug">Slug</Label>
									<Input
										id="agent-slug"
										placeholder="my-assistant"
										value={form.slug}
										onChange={(e) =>
											setForm({
												...form,
												slug: e.target.value,
											})
										}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="agent-sharing">Access</Label>
									<Select
										value={form.sharingMode}
										onValueChange={(value) =>
											setForm({
												...form,
												sharingMode: value as Agent["sharingMode"],
											})
										}
									>
										<SelectTrigger id="agent-sharing" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="personal">Personal</SelectItem>
											<SelectItem value="marketplace">
												Share with workspace
											</SelectItem>
											<SelectItem value="specific_user">
												Specific user
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								{form.sharingMode === "specific_user" ? (
									<div className="flex flex-col gap-2">
										<Label htmlFor="agent-share-email">User email</Label>
										<Input
											id="agent-share-email"
											type="email"
											value={form.shareTargetEmail}
											onChange={(e) =>
												setForm({ ...form, shareTargetEmail: e.target.value })
											}
										/>
									</div>
								) : null}
								{canAdminCurate ? (
									<div className="rounded-xl border border-border/70 p-3">
										<div className="flex flex-col gap-3 text-sm">
											<div className="flex items-center gap-2">
												<Checkbox
													id="agent-global"
													checked={form.isGlobal}
													onCheckedChange={(checked) =>
														setForm({ ...form, isGlobal: checked === true })
													}
												/>
												<label htmlFor="agent-global">Global</label>
											</div>
											<div className="flex items-center gap-2">
												<Checkbox
													id="agent-recommended"
													checked={form.isRecommended}
													onCheckedChange={(checked) =>
														setForm({
															...form,
															isRecommended: checked === true,
														})
													}
												/>
												<label htmlFor="agent-recommended">Recommended</label>
											</div>
											<Select
												value={form.curationLabel}
												onValueChange={(value) =>
													setForm({ ...form, curationLabel: value })
												}
											>
												<SelectTrigger className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">No label</SelectItem>
													<SelectItem value="recommended">
														Recommended
													</SelectItem>
													<SelectItem value="organization_created">
														Organization created
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
								) : null}
							</>
						) : null}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowCreateDialog(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleCreate}
							disabled={
								creating ||
								!form.name.trim() ||
								!form.slug.trim() ||
								(form.sharingMode === "specific_user" &&
									!form.shareTargetEmail.trim())
							}
						>
							{creating ? (
								<>
									<Loader2 className="size-4 animate-spin" aria-hidden="true" />
									Creating…
								</>
							) : (
								"Create agent"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={deleteAgentId !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteAgentId(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete agent?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes the agent and its configuration versions.
							This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleting}
							onClick={() => void handleDelete()}
						>
							{deleting ? "Deleting…" : "Delete agent"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Search bar */}
			{agents.length > 2 && (
				<div className="relative">
					<SearchIcon
						className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						placeholder="Search assistants…"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-9"
					/>
				</div>
			)}

			{loading ? (
				<div className="flex items-center justify-center py-20">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			) : agents.length === 0 ? (
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BotIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No assistants yet</EmptyTitle>
						<EmptyDescription>
							Create your first assistant to start chatting with AI. Each
							assistant gets its own model, system prompt, tools, and knowledge
							bases.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button type="button" onClick={() => setShowCreateDialog(true)}>
							<PlusIcon data-icon="inline-start" aria-hidden="true" />
							Create your first assistant
						</Button>
					</EmptyContent>
				</Empty>
			) : filteredAgents.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 text-center">
					<SearchIcon
						className="size-8 text-muted-foreground/50"
						aria-hidden="true"
					/>
					<p className="mt-3 text-sm font-medium">
						No assistants match your search
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Try a different keyword or clear the search
					</p>
					<Button
						variant="ghost"
						size="sm"
						className="mt-3"
						onClick={() => setSearchQuery("")}
					>
						Clear search
					</Button>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{filteredAgents.map((agent) => {
						const bindings = bindingSummaries[agent.id];
						const isReady = Boolean(agent.activeVersionId);
						const avatarColor = getAvatarColor(agent.name);
						const initials = getInitials(agent.name);

						return (
							<Card
								key={agent.id}
								className={cn(
									"group relative overflow-hidden transition-shadow hover:shadow-md",
									!isReady && "border-l-2 border-l-amber-500",
								)}
							>
								{/* Top accent bar */}
								<div
									className={cn(
										"absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
										avatarColor,
									)}
								/>

								<div className="flex flex-col gap-4 p-4 pt-5">
									{/* Header: avatar + name + delete */}
									<div className="flex items-start justify-between gap-2">
										<div className="flex min-w-0 items-center gap-3">
											<div
												className={cn(
													"flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
													avatarColor,
												)}
											>
												<span className="text-sm font-bold">{initials}</span>
											</div>
											<div className="min-w-0">
												<p className="truncate font-semibold">{agent.name}</p>
												{agent.description ? (
													<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
														{agent.description}
													</p>
												) : (
													<p className="mt-0.5 line-clamp-1 text-xs italic text-muted-foreground/60">
														No description
													</p>
												)}
											</div>
										</div>
										<Button
											variant="ghost"
											size="icon"
											className="size-8 shrink-0 -translate-x-1 opacity-0 transition-opacity group-hover:opacity-100"
											onClick={() => setDeleteAgentId(agent.id)}
											aria-label={`Delete ${agent.name}`}
										>
											<TrashIcon className="size-4 text-destructive" />
										</Button>
									</div>

									{/* Status + sharing badges */}
									<div className="flex flex-wrap items-center gap-2">
										<Badge
											variant={isReady ? "default" : "outline"}
											className={cn(
												"gap-1",
												isReady
													? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25"
													: "",
											)}
										>
											{isReady ? (
												<SparklesIcon className="size-3" aria-hidden="true" />
											) : (
												<ClockIcon className="size-3" aria-hidden="true" />
											)}
											{isReady ? "Ready" : "Needs setup"}
										</Badge>

										{agent.sharingMode === "marketplace" && (
											<Badge variant="secondary" className="gap-1">
												<UsersIcon className="size-3" aria-hidden="true" />
												Workspace
											</Badge>
										)}
										{agent.sharingMode === "specific_user" && (
											<Badge variant="secondary" className="gap-1">
												<ShieldIcon className="size-3" aria-hidden="true" />
												Shared
											</Badge>
										)}
										{agent.isGlobal && (
											<Badge variant="secondary" className="gap-1">
												<GlobeIcon className="size-3" aria-hidden="true" />
												Global
											</Badge>
										)}
										{agent.isRecommended && (
											<Badge variant="secondary" className="gap-1">
												<StarIcon className="size-3" aria-hidden="true" />
												Recommended
											</Badge>
										)}
									</div>

									{/* Capability indicators */}
									<div className="grid grid-cols-3 gap-2">
										<div className="flex flex-col items-center rounded-lg bg-muted/50 px-2 py-2 text-center">
											<WrenchIcon
												className="size-3.5 text-muted-foreground"
												aria-hidden="true"
											/>
											<span className="mt-1 text-xs font-medium">
												{bindings?.toolCount ?? "–"}
											</span>
											<span className="text-[10px] text-muted-foreground">
												Tools
											</span>
										</div>
										<div className="flex flex-col items-center rounded-lg bg-muted/50 px-2 py-2 text-center">
											<BookOpenIcon
												className="size-3.5 text-muted-foreground"
												aria-hidden="true"
											/>
											<span className="mt-1 text-xs font-medium">
												{bindings?.knowledgeCount ?? "–"}
											</span>
											<span className="text-[10px] text-muted-foreground">
												Knowledge
											</span>
										</div>
										<div className="flex flex-col items-center rounded-lg bg-muted/50 px-2 py-2 text-center">
											<ServerIcon
												className="size-3.5 text-muted-foreground"
												aria-hidden="true"
											/>
											<span className="mt-1 text-xs font-medium">
												{bindings?.mcpCount ?? "–"}
											</span>
											<span className="text-[10px] text-muted-foreground">
												MCP
											</span>
										</div>
									</div>

									{/* Metadata */}
									<div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
										<span>Created {timeAgo(agent.createdAt)}</span>
										<span className="font-mono opacity-60">{agent.slug}</span>
									</div>

									{/* Actions */}
									<div className="flex gap-2">
										<Button
											variant={isReady ? "default" : "outline"}
											size="sm"
											className="flex-1"
											onClick={() =>
												router.push(
													agent.activeVersionId
														? `/chat?agentId=${agent.id}`
														: `/agents/${agent.id}`,
												)
											}
										>
											{isReady ? "Chat now" : "Finish setup"}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="shrink-0"
											onClick={() => router.push(`/agents/${agent.id}`)}
										>
											Configure
										</Button>
									</div>
								</div>
							</Card>
						);
					})}
				</div>
			)}
		</WorkspacePage>
	);
}
