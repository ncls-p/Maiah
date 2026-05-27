"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
	BotIcon,
	PlusIcon,
	TrashIcon,
	ChevronRightIcon,
	Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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

function getBrowserWorkspaceId() {
	if (typeof window === "undefined") return null;
	return window.sessionStorage.getItem("active_workspace_id");
}

function useWorkspaceId() {
	const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
		getBrowserWorkspaceId(),
	);

	useEffect(() => {
		if (workspaceId) return;
		fetch("/api/workspaces")
			.then((res) => res.json())
			.then((data) => {
				if (Array.isArray(data) && data.length > 0) {
					const wsId = data[0].workspace?.id || data[0].id;
					if (wsId) {
						setWorkspaceId(wsId);
						window.sessionStorage.setItem("active_workspace_id", wsId);
					}
				}
			})
			.catch(() => {});
	}, [workspaceId]);

	return workspaceId;
}

export default function AgentsPage() {
	const router = useRouter();
	const workspaceId = useWorkspaceId();
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(true);
	const [canAdminCurate, setCanAdminCurate] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [creating, setCreating] = useState(false);
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
	const abortRef = useRef<AbortController | null>(null);

	const refreshAgents = async () => {
		if (!workspaceId) return;
		abortRef.current?.abort();
		abortRef.current = new AbortController();
		try {
			const res = await fetch(`/api/workspace/agents?workspaceId=${workspaceId}`, {
				signal: abortRef.current.signal,
			});
			if (!res.ok) throw new Error("Failed to fetch agents");
			const data = await res.json();
			setAgents(Array.isArray(data) ? data : data.agents);
			setCanAdminCurate(Boolean(data.canAdminCurate));
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
					setAgents(Array.isArray(data) ? data : data.agents);
					setCanAdminCurate(Boolean(data.canAdminCurate));
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
		if (!workspaceId || !form.name.trim() || !form.slug.trim()) return;
		setCreating(true);
		try {
			const res = await fetch("/api/workspace/agents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: form.name.trim(),
					slug: form.slug
						.trim()
						.toLowerCase()
						.replace(/[^a-z0-9-]/g, "-"),
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

	const handleDelete = async (agentId: string) => {
		if (!workspaceId) return;
		if (!confirm("Are you sure you want to delete this agent?")) return;
		try {
			const res = await fetch(
				`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`,
				{
					method: "DELETE",
				},
			);

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Failed to delete agent");
			}

			toast.success("Agent deleted");
			await refreshAgents();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to delete agent",
			);
		}
	};

	if (!workspaceId) {
		return (
			<div className="flex items-center justify-center h-full">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div className="flex flex-col gap-2">
					<div className="section-kicker">Agents</div>
					<h1 className="text-2xl font-semibold sm:text-3xl">
						Versioned agent workspace
					</h1>
					<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
						Design assistants with model settings, tools, knowledge, and
						deployment-safe configuration versions.
					</p>
				</div>
				<Button type="button" onClick={() => setShowCreateDialog(true)}>
					<PlusIcon data-icon="inline-start" aria-hidden="true" />
					New agent
				</Button>
			</div>

			{showCreateDialog && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<Card className="w-full max-w-md mx-4">
						<CardHeader>
							<CardTitle>Create new agent</CardTitle>
							<CardDescription>
								Give your agent a name and optional description.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<Label htmlFor="agent-name">Name</Label>
								<Input
									id="agent-name"
									placeholder="My Assistant"
									value={form.name}
									onChange={(e) =>
										setForm({
											...form,
											name: e.target.value,
										})
									}
									autoFocus
								/>
							</div>
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
								<Label htmlFor="agent-description">
									Description (optional)
								</Label>
								<Input
									id="agent-description"
									placeholder="A helpful assistant for..."
									value={form.description}
									onChange={(e) =>
										setForm({
											...form,
											description: e.target.value,
										})
									}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="agent-sharing">Access</Label>
								<select
									id="agent-sharing"
									className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
									value={form.sharingMode}
									onChange={(e) =>
										setForm({
											...form,
											sharingMode: e.target.value as Agent["sharingMode"],
										})
									}
								>
									<option value="personal">Personal</option>
									<option value="marketplace">Marketplace</option>
									<option value="specific_user">Specific user</option>
								</select>
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
									<div className="flex flex-col gap-2 text-sm">
										<label className="flex items-center gap-2">
											<input
												type="checkbox"
												checked={form.isGlobal}
												onChange={(e) =>
													setForm({ ...form, isGlobal: e.target.checked })
												}
											/>
											Global
										</label>
										<label className="flex items-center gap-2">
											<input
												type="checkbox"
												checked={form.isRecommended}
												onChange={(e) =>
													setForm({
														...form,
														isRecommended: e.target.checked,
													})
												}
											/>
											Recommended
										</label>
										<select
											className="h-10 rounded-xl border border-input bg-background px-3"
											value={form.curationLabel}
											onChange={(e) =>
												setForm({ ...form, curationLabel: e.target.value })
											}
										>
											<option value="none">No label</option>
											<option value="recommended">Recommended</option>
											<option value="organization_created">
												Organization created
											</option>
										</select>
									</div>
								</div>
							) : null}
							<div className="flex justify-end gap-2 pt-2">
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
											<Loader2 className="size-4 animate-spin" />
											Creating...
										</>
									) : (
										"Create agent"
									)}
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{loading ? (
				<div className="flex items-center justify-center py-20">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			) : agents.length === 0 ? (
				<Card>
					<CardContent>
						<Empty className="min-h-72 border border-border/70 bg-background/55">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<BotIcon aria-hidden="true" />
								</EmptyMedia>
								<EmptyTitle>No agents yet</EmptyTitle>
								<EmptyDescription>
									Create your first agent to start configuring model behavior,
									tools, and knowledge sources.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button
									type="button"
									size="sm"
									onClick={() => setShowCreateDialog(true)}
								>
									<PlusIcon data-icon="inline-start" aria-hidden="true" />
									Create agent
								</Button>
							</EmptyContent>
						</Empty>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{agents.map((agent) => (
						<Card key={agent.id} className="group relative">
							<CardHeader className="pb-3">
								<div className="flex items-start justify-between">
									<CardTitle className="flex items-center gap-2 text-base">
										<BotIcon
											className="size-4 text-primary"
											aria-hidden="true"
										/>
										{agent.name}
									</CardTitle>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={() => handleDelete(agent.id)}
										aria-label={`Delete ${agent.name}`}
									>
										<TrashIcon className="size-4 text-destructive" />
									</Button>
								</div>
								{agent.description && (
									<CardDescription className="line-clamp-2">
										{agent.description}
									</CardDescription>
								)}
								<div className="mt-3 flex flex-wrap gap-2">
									<Badge variant="outline">
										{agent.sharingMode === "specific_user"
											? "Shared"
											: agent.sharingMode === "marketplace"
												? "Marketplace"
												: "Personal"}
									</Badge>
									{agent.isGlobal ? <Badge variant="secondary">Global</Badge> : null}
									{agent.isRecommended ? (
										<Badge variant="secondary">Recommended</Badge>
									) : null}
									{agent.curationLabel === "organization_created" ? (
										<Badge variant="secondary">Organization created</Badge>
									) : null}
								</div>
							</CardHeader>
							<CardContent>
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>
										{agent.activeVersionId
											? "Has active version"
											: "No version configured"}
									</span>
									<span>{new Date(agent.updatedAt).toLocaleDateString()}</span>
								</div>
								<div className="mt-3 flex gap-2">
									<Button
										variant="outline"
										size="sm"
										className="flex-1"
										onClick={() => router.push(`/chat?agentId=${agent.id}`)}
									>
										Chat
										<ChevronRightIcon className="size-3 ml-1" />
									</Button>
									<Button
										variant="outline"
										size="sm"
										className="flex-1"
										onClick={() => router.push(`/agents/${agent.id}`)}
									>
										Configure
									</Button>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
