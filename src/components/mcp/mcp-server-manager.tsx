"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	CheckCircle2,
	ChevronDownIcon,
	ClipboardList,
	Loader2,
	MoreHorizontal,
	NetworkIcon,
	PencilIcon,
	PlusIcon,
	RefreshCwIcon,
	SearchIcon,
	ShieldAlert,
	Trash2Icon,
	Wrench,
	XIcon,
	ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

/* ─── types ─────────────────────────────────────────── */

interface McpServer {
	id: string;
	name: string;
	transport: string;
	url: string | null;
	command: string | null;
	healthStatus: string | null;
	enabled: boolean;
	requireApproval: boolean;
	argsJson?: string[] | null;
	hasHeaders: boolean;
	hasEnv: boolean;
}

interface McpTool {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	requireApproval: boolean;
}

type SimpleAuthMode = "none" | "bearer" | "api-key" | "env";
type HealthColor = "success" | "warning" | "destructive" | "muted";

/* ─── helpers ───────────────────────────────────────── */

const emptyForm = {
	name: "",
	transport: "streamable-http",
	url: "",
	command: "",
	args: "",
	authMode: "none" as SimpleAuthMode,
	bearerToken: "",
	apiKeyHeader: "X-API-Key",
	apiKeyValue: "",
	envKeyName: "API_KEY",
	envKeyValue: "",
	requireApproval: false,
	headers: "",
	env: "",
};

function parsePairs(input: string) {
	const rows = input
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (rows.length === 0) return undefined;
	const result: Record<string, string> = {};
	for (const row of rows) {
		const idx = row.indexOf("=");
		if (idx === -1) continue;
		const key = row.slice(0, idx).trim();
		const value = row.slice(idx + 1).trim();
		if (key) result[key] = value;
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

function mergeRecords(
	...records: Array<Record<string, string> | undefined>
): Record<string, string> | undefined {
	const merged: Record<string, string> = {};
	for (const record of records) {
		if (!record) continue;
		Object.assign(merged, record);
	}
	return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildSimpleAuthHeaders(form: typeof emptyForm) {
	if (form.transport === "stdio") return undefined;
	if (form.authMode === "bearer" && form.bearerToken.trim()) {
		return { Authorization: `Bearer ${form.bearerToken.trim()}` };
	}
	if (
		form.authMode === "api-key" &&
		form.apiKeyHeader.trim() &&
		form.apiKeyValue.trim()
	) {
		return { [form.apiKeyHeader.trim()]: form.apiKeyValue.trim() };
	}
	return undefined;
}

function buildSimpleAuthEnv(form: typeof emptyForm) {
	if (
		form.transport === "stdio" &&
		form.authMode === "env" &&
		form.envKeyName.trim() &&
		form.envKeyValue.trim()
	) {
		return { [form.envKeyName.trim()]: form.envKeyValue.trim() };
	}
	return undefined;
}

function buildHeaders(form: typeof emptyForm) {
	return mergeRecords(buildSimpleAuthHeaders(form), parsePairs(form.headers));
}

function buildEnv(form: typeof emptyForm) {
	return mergeRecords(buildSimpleAuthEnv(form), parsePairs(form.env));
}

function getHealthColor(status: string | null): HealthColor {
	if (!status) return "muted";
	const s = status.toLowerCase();
	if (s === "connected" || s === "healthy" || s === "ok") return "success";
	if (s === "degraded" || s === "warning") return "warning";
	if (s === "error" || s === "disconnected" || s === "failed")
		return "destructive";
	return "muted";
}

function healthDotClass(color: HealthColor) {
	const map: Record<HealthColor, string> = {
		success: "bg-success",
		warning: "bg-warning",
		destructive: "bg-destructive",
		muted: "bg-muted-foreground",
	};
	return cn("size-2 rounded-full shrink-0", map[color]);
}

function transportLabel(transport: string) {
	switch (transport) {
		case "streamable-http":
			return "Streamable HTTP";
		case "sse":
			return "SSE";
		case "stdio":
			return "Stdio";
		default:
			return transport;
	}
}

/* ─── stat card ─────────────────────────────────────── */

function StatCard({
	icon: Icon,
	label,
	value,
	className,
}: {
	icon: typeof NetworkIcon;
	label: string;
	value: number | string;
	className?: string;
}) {
	return (
		<Card size="sm" className={cn("flex items-center gap-3", className)}>
			<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
				<Icon className="size-4" aria-hidden="true" />
			</div>
			<div>
				<p className="text-lg font-semibold tracking-tight">{value}</p>
				<p className="text-xs text-muted-foreground">{label}</p>
			</div>
		</Card>
	);
}

/* ─── auth section (shared between create / edit) ──── */

function AuthSection({
	form,
	setForm,
	transport,
	prefix,
}: {
	form: typeof emptyForm;
	setForm: (f: typeof emptyForm) => void;
	transport: string;
	prefix: string;
}) {
	return (
		<div className="grid min-w-0 gap-3 rounded-lg border border-border/70 bg-background/70 p-3">
			<div className="grid min-w-0 gap-2">
				<Label htmlFor={`${prefix}-auth-mode`}>Authentication</Label>
				<Select
					value={form.authMode}
					onValueChange={(value) =>
						setForm({ ...form, authMode: value as SimpleAuthMode })
					}
				>
					<SelectTrigger id={`${prefix}-auth-mode`} className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">No auth</SelectItem>
						{transport === "stdio" ? (
							<SelectItem value="env">API key / token</SelectItem>
						) : (
							<>
								<SelectItem value="bearer">Bearer token</SelectItem>
								<SelectItem value="api-key">API key header</SelectItem>
							</>
						)}
					</SelectContent>
				</Select>
			</div>

			{transport === "stdio" && form.authMode === "env" ? (
				<div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
					<div className="grid gap-2">
						<Label htmlFor={`${prefix}-env-key-name`}>Variable name</Label>
						<Input
							id={`${prefix}-env-key-name`}
							autoComplete="off"
							value={form.envKeyName}
							onChange={(e) => setForm({ ...form, envKeyName: e.target.value })}
							placeholder="API_KEY"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={`${prefix}-env-key-value`}>Secret value</Label>
						<Input
							id={`${prefix}-env-key-value`}
							type="password"
							autoComplete="off"
							value={form.envKeyValue}
							onChange={(e) =>
								setForm({ ...form, envKeyValue: e.target.value })
							}
							placeholder="Paste token…"
						/>
					</div>
				</div>
			) : null}

			{transport !== "stdio" && form.authMode === "bearer" ? (
				<div className="grid gap-2">
					<Label htmlFor={`${prefix}-bearer-token`}>Bearer token</Label>
					<Input
						id={`${prefix}-bearer-token`}
						type="password"
						autoComplete="off"
						value={form.bearerToken}
						onChange={(e) => setForm({ ...form, bearerToken: e.target.value })}
						placeholder="Paste token…"
					/>
				</div>
			) : null}

			{transport !== "stdio" && form.authMode === "api-key" ? (
				<div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
					<div className="grid gap-2">
						<Label htmlFor={`${prefix}-api-key-header`}>Header name</Label>
						<Input
							id={`${prefix}-api-key-header`}
							autoComplete="off"
							value={form.apiKeyHeader}
							onChange={(e) =>
								setForm({ ...form, apiKeyHeader: e.target.value })
							}
							placeholder="X-API-Key"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={`${prefix}-api-key-value`}>API key</Label>
						<Input
							id={`${prefix}-api-key-value`}
							type="password"
							autoComplete="off"
							value={form.apiKeyValue}
							onChange={(e) =>
								setForm({ ...form, apiKeyValue: e.target.value })
							}
							placeholder="Paste key…"
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}

/* ─── advanced section (shared) ─────────────────────── */

function AdvancedSection({
	open,
	onOpenChange,
	form,
	setForm,
	prefix,
	placeholder,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	form: typeof emptyForm;
	setForm: (f: typeof emptyForm) => void;
	prefix: string;
	placeholder: string;
}) {
	return (
		<Collapsible
			open={open}
			onOpenChange={onOpenChange}
			className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-muted/20"
		>
			<CollapsibleTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className="flex w-full justify-between px-3 py-2 text-sm"
				>
					<span>Advanced options</span>
					<ChevronDownIcon
						className={cn("size-4 transition-transform", open && "rotate-180")}
						aria-hidden="true"
					/>
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent className="grid min-w-0 gap-4 border-t border-border/60 p-3">
				<p className="text-xs text-muted-foreground">{placeholder}</p>
				<div className="grid gap-2">
					<Label htmlFor={`${prefix}-headers`}>HTTP headers</Label>
					<Textarea
						id={`${prefix}-headers`}
						autoComplete="off"
						value={form.headers}
						onChange={(e) => setForm({ ...form, headers: e.target.value })}
						placeholder="Authorization=Bearer sk-…"
					/>
					<p className="text-xs text-muted-foreground">
						One header per line as <code>Key=Value</code>.
					</p>
				</div>
				<div className="grid gap-2">
					<Label htmlFor={`${prefix}-env`}>Environment variables</Label>
					<Textarea
						id={`${prefix}-env`}
						autoComplete="off"
						value={form.env}
						onChange={(e) => setForm({ ...form, env: e.target.value })}
						placeholder="API_KEY=…"
					/>
					<p className="text-xs text-muted-foreground">
						One variable per line as <code>KEY=VALUE</code>.
					</p>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

/* ─── main component ────────────────────────────────── */

export function McpServerManager() {
	const { workspaceId } = useWorkspace();

	// data
	const [servers, setServers] = useState<McpServer[]>([]);
	const [toolsByServer, setToolsByServer] = useState<Record<string, McpTool[]>>(
		{},
	);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);

	// UI state
	const [search, setSearch] = useState("");
	const [filterStatus, setFilterStatus] = useState<
		"all" | "enabled" | "disabled"
	>("all");
	const [showCreate, setShowCreate] = useState(false);
	const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
	const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
	const [form, setForm] = useState(emptyForm);
	const [editServer, setEditServer] = useState<McpServer | null>(null);
	const [editForm, setEditForm] = useState(emptyForm);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [expandedServers, setExpandedServers] = useState<
		Record<string, boolean>
	>({});
	const [toolSearch, setToolSearch] = useState<Record<string, string>>({});

	// load
	const load = useCallback(async () => {
		if (!workspaceId) return;
		setLoading(true);
		try {
			const res = await fetch(
				`/api/workspace/mcp-servers?workspaceId=${workspaceId}`,
			);
			if (!res.ok) throw new Error("Failed to load MCP servers");
			const data = (await res.json()) as McpServer[];
			setServers(data);
			const entries = await Promise.all(
				data.map(async (server) => {
					const toolRes = await fetch(
						`/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`,
					);
					return [server.id, toolRes.ok ? await toolRes.json() : []] as const;
				}),
			);
			setToolsByServer(Object.fromEntries(entries));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to load MCP servers",
			);
		} finally {
			setLoading(false);
		}
	}, [workspaceId]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- async MCP bootstrap
		void load();
	}, [load]);

	// filtered servers
	const filteredServers = useMemo(() => {
		let result = servers;
		if (search.trim()) {
			const q = search.toLowerCase();
			result = result.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.transport.toLowerCase().includes(q) ||
					(s.url ?? "").toLowerCase().includes(q) ||
					(s.command ?? "").toLowerCase().includes(q),
			);
		}
		if (filterStatus === "enabled") result = result.filter((s) => s.enabled);
		if (filterStatus === "disabled") result = result.filter((s) => !s.enabled);
		return result;
	}, [servers, search, filterStatus]);

	// stats
	const stats = useMemo(() => {
		const totalServers = servers.length;
		const totalTools = Object.values(toolsByServer).reduce(
			(sum, t) => sum + t.length,
			0,
		);
		const enabledServers = servers.filter((s) => s.enabled).length;
		const enabledTools = Object.values(toolsByServer).reduce(
			(sum, t) => sum + t.filter((t) => t.enabled).length,
			0,
		);
		return { totalServers, totalTools, enabledServers, enabledTools };
	}, [servers, toolsByServer]);

	/* ─── actions ───────────────────────────────────── */

	async function createServer() {
		if (!workspaceId || !form.name.trim()) return;
		setBusy(true);
		try {
			const res = await fetch("/api/workspace/mcp-servers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					name: form.name.trim(),
					transport: form.transport,
					url: form.url.trim() || undefined,
					command: form.command.trim() || undefined,
					args: form.args
						.split("\n")
						.map((line) => line.trim())
						.filter(Boolean),
					requireApproval: form.requireApproval,
					headers: buildHeaders(form),
					env: buildEnv(form),
				}),
			});
			if (!res.ok) throw new Error((await res.json()).error || "Failed");
			setForm(emptyForm);
			setShowCreate(false);
			setShowAdvancedCreate(false);
			toast.success("MCP server added");
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create server",
			);
		} finally {
			setBusy(false);
		}
	}

	async function saveEdit() {
		if (!workspaceId || !editServer) return;
		setBusy(true);
		try {
			const res = await fetch(`/api/workspace/mcp-servers/${editServer.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					name: editForm.name.trim(),
					url: editForm.url.trim() || "",
					command: editForm.command.trim() || undefined,
					args: editForm.args
						.split("\n")
						.map((line) => line.trim())
						.filter(Boolean),
					enabled: editServer.enabled,
					requireApproval: editForm.requireApproval,
					headers: buildHeaders(editForm),
					env: buildEnv(editForm),
				}),
			});
			if (!res.ok) throw new Error((await res.json()).error || "Failed");
			setEditServer(null);
			setShowAdvancedEdit(false);
			toast.success("MCP server updated");
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update server",
			);
		} finally {
			setBusy(false);
		}
	}

	async function removeServer(serverId: string) {
		if (!workspaceId) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/mcp-servers/${serverId}?workspaceId=${workspaceId}`,
				{ method: "DELETE" },
			);
			if (!res.ok) throw new Error("Failed to remove");
			setDeleteId(null);
			toast.success("MCP server removed");
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove server",
			);
		} finally {
			setBusy(false);
		}
	}

	async function sync(serverId: string) {
		if (!workspaceId) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/mcp-servers/${serverId}/tools?workspaceId=${workspaceId}`,
				{ method: "POST" },
			);
			const data = (await res.json().catch(() => ({}))) as {
				discovered?: number;
				status?: string;
				error?: string;
			};
			if (res.ok) {
				toast.success(
					data.discovered
						? `Synced ${data.discovered} tools`
						: "Sync completed — no tools returned",
				);
				await load();
			} else {
				toast.error(data.error || "Sync failed");
			}
		} finally {
			setBusy(false);
		}
	}

	async function test(serverId: string) {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/mcp-servers/${serverId}/test?workspaceId=${workspaceId}`,
			{ method: "POST" },
		);
		const data = await res.json().catch(() => ({}));
		if (res.ok) {
			toast.success(data.message || "Connection OK");
			await load();
		} else toast.error(data.error || "Connection failed");
	}

	async function toggleTool(
		serverId: string,
		toolId: string,
		enabled: boolean,
	) {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/mcp-servers/${serverId}/tools/${toolId}`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, enabled }),
			},
		);
		if (!res.ok) {
			toast.error("Unable to update tool");
			return;
		}
		await load();
	}

	async function toggleEnabled(server: McpServer, enabled: boolean) {
		if (!workspaceId) return;
		const res = await fetch(`/api/workspace/mcp-servers/${server.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ workspaceId, enabled }),
		});
		if (!res.ok) {
			toast.error("Unable to update server");
			return;
		}
		await load();
	}

	async function toggleServerApproval(
		server: McpServer,
		requireApproval: boolean,
	) {
		if (!workspaceId) return;
		const res = await fetch(`/api/workspace/mcp-servers/${server.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ workspaceId, requireApproval }),
		});
		if (!res.ok) {
			toast.error("Unable to update approval policy");
			return;
		}
		await load();
	}

	async function toggleToolApproval(
		serverId: string,
		toolId: string,
		requireApproval: boolean,
	) {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/mcp-servers/${serverId}/tools/${toolId}`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, requireApproval }),
			},
		);
		if (!res.ok) {
			toast.error("Unable to update approval policy");
			return;
		}
		await load();
	}

	/* ─── render ────────────────────────────────────── */

	return (
		<div className="flex flex-col gap-6">
			{/* ── Stats overview ── */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					icon={NetworkIcon}
					label="Total servers"
					value={stats.totalServers}
				/>
				<StatCard
					icon={CheckCircle2}
					label="Enabled servers"
					value={stats.enabledServers}
				/>
				<StatCard icon={Wrench} label="Total tools" value={stats.totalTools} />
				<StatCard
					icon={ClipboardList}
					label="Enabled tools"
					value={stats.enabledTools}
				/>
			</div>

			{/* ── Search & filter bar ── */}
			{servers.length > 0 && (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="relative flex-1">
						<SearchIcon
							className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
							aria-hidden="true"
						/>
						<Input
							placeholder="Search servers…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="pl-9"
						/>
						{search ? (
							<Button
								variant="ghost"
								size="icon-sm"
								className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
								onClick={() => setSearch("")}
								aria-label="Clear search"
							>
								<XIcon className="size-3" aria-hidden="true" />
							</Button>
						) : null}
					</div>
					<div className="flex items-center gap-2">
						<Select
							value={filterStatus}
							onValueChange={(v) =>
								setFilterStatus(v as "all" | "enabled" | "disabled")
							}
						>
							<SelectTrigger className="w-36">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All servers</SelectItem>
								<SelectItem value="enabled">Enabled</SelectItem>
								<SelectItem value="disabled">Disabled</SelectItem>
							</SelectContent>
						</Select>
						<Button
							variant="default"
							size="sm"
							onClick={() => setShowCreate(true)}
						>
							<PlusIcon data-icon="inline-start" aria-hidden="true" />
							Add Server
						</Button>
					</div>
				</div>
			)}

			{/* ── Loading ── */}
			{loading ? (
				<div className="flex justify-center py-12">
					<Loader2 className="animate-spin" aria-hidden="true" />
				</div>
			) : filteredServers.length === 0 ? (
				/* ── Empty state ── */
				servers.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<NetworkIcon className="size-5" aria-hidden="true" />
							</EmptyMedia>
							<EmptyTitle>No MCP servers configured</EmptyTitle>
							<EmptyDescription>
								Connect an MCP server to give your agents access to external
								tools. Start by adding your first server.
							</EmptyDescription>
						</EmptyHeader>
						<Button variant="default" onClick={() => setShowCreate(true)}>
							<PlusIcon data-icon="inline-start" aria-hidden="true" />
							Add your first server
						</Button>
					</Empty>
				) : (
					/* ── No search results ── */
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<SearchIcon className="size-5" aria-hidden="true" />
							</EmptyMedia>
							<EmptyTitle>No matching servers</EmptyTitle>
							<EmptyDescription>
								No servers match &ldquo;{search}&rdquo;. Try a different search
								or clear the filter.
							</EmptyDescription>
						</EmptyHeader>
						<Button variant="outline" onClick={() => setSearch("")}>
							Clear search
						</Button>
					</Empty>
				)
			) : null}

			{/* ── Server list ── */}
			{filteredServers.length > 0 && (
				<div className="grid gap-4">
					{filteredServers.map((server) => {
						const tools = toolsByServer[server.id] ?? [];
						const isExpanded = expandedServers[server.id] ?? false;
						const healthColor = getHealthColor(server.healthStatus);
						const serverToolSearch = toolSearch[server.id] ?? "";
						const filteredTools = serverToolSearch
							? tools.filter(
									(t) =>
										t.name
											.toLowerCase()
											.includes(serverToolSearch.toLowerCase()) ||
										(t.description ?? "")
											.toLowerCase()
											.includes(serverToolSearch.toLowerCase()),
								)
							: tools;

						return (
							<Collapsible
								key={server.id}
								open={isExpanded}
								onOpenChange={(open) =>
									setExpandedServers((current) => ({
										...current,
										[server.id]: open,
									}))
								}
							>
								<Card
									className={cn(
										"transition-shadow",
										!server.enabled && "opacity-60",
									)}
								>
									<CardHeader>
										<div className="flex flex-wrap items-start justify-between gap-3">
											{/* Left: expand + info */}
											<div className="flex min-w-0 flex-1 items-start gap-2">
												<CollapsibleTrigger asChild>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="mt-0.5 size-8 shrink-0"
														aria-label={
															isExpanded
																? `Collapse ${server.name} tools`
																: `Expand ${server.name} tools`
														}
													>
														<ChevronDownIcon
															className={cn(
																"transition-transform",
																isExpanded && "rotate-180",
															)}
															aria-hidden="true"
														/>
													</Button>
												</CollapsibleTrigger>
												<div className="min-w-0">
													<CardTitle className="flex flex-wrap items-center gap-2">
														<span className="truncate">{server.name}</span>
														<Badge
															variant="outline"
															className={cn(
																"font-normal",
																server.enabled
																	? "text-success"
																	: "text-muted-foreground",
															)}
														>
															<span className={healthDotClass(healthColor)} />
															{transportLabel(server.transport)}
														</Badge>
														{tools.length > 0 ? (
															<Badge variant="secondary">
																{tools.length} tool
																{tools.length === 1 ? "" : "s"}
															</Badge>
														) : null}
													</CardTitle>
													<CardDescription className="truncate">
														{server.url || server.command || server.transport}
													</CardDescription>
												</div>
											</div>

											{/* Right: controls */}
											<div className="flex shrink-0 items-center gap-2">
												{/* Quick toggles */}
												<div className="hidden items-center gap-3 sm:flex">
													<div className="flex items-center gap-1.5">
														<span className="text-xs text-muted-foreground">
															Enabled
														</span>
														<Switch
															aria-label={`Enable ${server.name}`}
															checked={server.enabled}
															onCheckedChange={(checked) =>
																void toggleEnabled(server, checked)
															}
														/>
													</div>
													<Separator orientation="vertical" className="h-4" />
													<div className="flex items-center gap-1.5">
														<span className="text-xs text-muted-foreground">
															Approval
														</span>
														<Switch
															aria-label={`Require approval for ${server.name}`}
															checked={server.requireApproval}
															onCheckedChange={(checked) =>
																void toggleServerApproval(server, checked)
															}
														/>
													</div>
												</div>

												{/* Status badges */}
												{server.requireApproval ? (
													<Badge
														variant="secondary"
														className="hidden lg:inline-flex"
													>
														<ShieldAlert
															className="size-3"
															aria-hidden="true"
														/>
														Approval
													</Badge>
												) : null}
												{server.hasHeaders ? (
													<Badge
														variant="secondary"
														className="hidden lg:inline-flex"
													>
														API key
													</Badge>
												) : null}

												{/* Actions dropdown */}
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															size="icon-sm"
															variant="ghost"
															aria-label="Server actions"
														>
															<MoreHorizontal aria-hidden="true" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() => void test(server.id)}
														>
															<ZapIcon aria-hidden="true" />
															Test connection
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => void sync(server.id)}
														>
															<RefreshCwIcon aria-hidden="true" />
															Sync tools
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() => {
																setEditServer(server);
																setEditForm({
																	name: server.name,
																	transport: server.transport,
																	url: server.url ?? "",
																	command: server.command ?? "",
																	args: server.argsJson?.join("\n") ?? "",
																	authMode: "none",
																	bearerToken: "",
																	apiKeyHeader: "X-API-Key",
																	apiKeyValue: "",
																	envKeyName: "API_KEY",
																	envKeyValue: "",
																	requireApproval: server.requireApproval,
																	headers: "",
																	env: "",
																});
																setShowAdvancedEdit(false);
															}}
														>
															<PencilIcon aria-hidden="true" />
															Edit server
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															variant="destructive"
															onClick={() => setDeleteId(server.id)}
														>
															<Trash2Icon aria-hidden="true" />
															Remove server
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
										</div>

										{/* Mobile toggles */}
										<div className="flex items-center gap-4 pt-2 sm:hidden">
											<div className="flex items-center gap-1.5">
												<span className="text-xs text-muted-foreground">
													Enabled
												</span>
												<Switch
													aria-label={`Enable ${server.name}`}
													checked={server.enabled}
													onCheckedChange={(checked) =>
														void toggleEnabled(server, checked)
													}
												/>
											</div>
											<div className="flex items-center gap-1.5">
												<span className="text-xs text-muted-foreground">
													Approval
												</span>
												<Switch
													aria-label={`Require approval for ${server.name}`}
													checked={server.requireApproval}
													onCheckedChange={(checked) =>
														void toggleServerApproval(server, checked)
													}
												/>
											</div>
											{server.requireApproval ? (
												<Badge variant="secondary">
													<ShieldAlert className="size-3" aria-hidden="true" />
													Approval
												</Badge>
											) : null}
											{server.hasHeaders ? (
												<Badge variant="secondary">API key</Badge>
											) : null}
										</div>
									</CardHeader>

									{/* ── Tools (collapsible) ── */}
									<CollapsibleContent>
										<div className="border-t border-border/60">
											{/* Tool search */}
											{tools.length > 3 && (
												<div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
													<SearchIcon
														className="size-4 shrink-0 text-muted-foreground"
														aria-hidden="true"
													/>
													<Input
														placeholder="Search tools…"
														value={serverToolSearch}
														onChange={(e) =>
															setToolSearch((prev) => ({
																...prev,
																[server.id]: e.target.value,
															}))
														}
														className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
													/>
													{serverToolSearch ? (
														<Button
															variant="ghost"
															size="icon-sm"
															className="size-6"
															onClick={() =>
																setToolSearch((prev) => ({
																	...prev,
																	[server.id]: "",
																}))
															}
														>
															<XIcon className="size-3" aria-hidden="true" />
														</Button>
													) : null}
												</div>
											)}

											<div className="max-h-96 overflow-y-auto">
												{filteredTools.length === 0 ? (
													<div className="px-4 py-6 text-center text-sm text-muted-foreground">
														{tools.length === 0
															? "No tools discovered. Run sync after configuring credentials."
															: "No tools match your search."}
													</div>
												) : (
													<div className="divide-y divide-border/30 px-4 py-2">
														{filteredTools.map((tool) => {
															const isApprovalForced =
																server.requireApproval || tool.requireApproval;

															return (
																<div
																	key={tool.id}
																	className={cn(
																		"flex items-center gap-3 py-2.5 transition-opacity",
																		!tool.enabled && "opacity-50",
																	)}
																>
																	{/* Tool icon */}
																	<div
																		className={cn(
																			"flex size-8 shrink-0 items-center justify-center rounded-lg",
																			tool.enabled
																				? "bg-primary/10 text-primary"
																				: "bg-muted text-muted-foreground",
																		)}
																	>
																		<Wrench
																			className="size-4"
																			aria-hidden="true"
																		/>
																	</div>

																	{/* Info */}
																	<div className="min-w-0 flex-1">
																		<div className="flex items-center gap-2">
																			<span className="truncate font-medium text-sm">
																				{tool.name}
																			</span>
																			<span
																				className={cn(
																					"size-2 shrink-0 rounded-full",
																					tool.enabled
																						? "bg-success"
																						: "bg-muted-foreground",
																				)}
																			/>
																		</div>
																		{tool.description ? (
																			<p className="line-clamp-1 text-xs text-muted-foreground">
																				{tool.description}
																			</p>
																		) : null}
																	</div>

																	{/* Badges */}
																	{isApprovalForced ? (
																		<Badge
																			variant="secondary"
																			className="hidden items-center gap-1 sm:flex"
																		>
																			<ShieldAlert
																				className="size-3"
																				aria-hidden="true"
																			/>
																			{server.requireApproval
																				? "Forced"
																				: "Approval"}
																		</Badge>
																	) : null}

																	{/* Toggles */}
																	<div className="flex shrink-0 items-center gap-3">
																		<div className="flex items-center gap-1.5">
																			<span className="hidden text-xs text-muted-foreground sm:inline">
																				Approval
																			</span>
																			<Switch
																				aria-label={`Require approval for ${tool.name}`}
																				checked={isApprovalForced}
																				disabled={server.requireApproval}
																				onCheckedChange={(checked) =>
																					void toggleToolApproval(
																						server.id,
																						tool.id,
																						checked,
																					)
																				}
																			/>
																		</div>
																		<div className="flex items-center gap-1.5">
																			<span className="hidden text-xs text-muted-foreground sm:inline">
																				Enabled
																			</span>
																			<Switch
																				aria-label={`Enable ${tool.name}`}
																				checked={tool.enabled}
																				onCheckedChange={(checked) =>
																					void toggleTool(
																						server.id,
																						tool.id,
																						checked,
																					)
																				}
																			/>
																		</div>
																	</div>
																</div>
															);
														})}
													</div>
												)}
											</div>
										</div>
									</CollapsibleContent>
								</Card>
							</Collapsible>
						);
					})}
				</div>
			)}

			{/* ════════════════════════════════════════════
			 *  CREATE DIALOG
			 * ════════════════════════════════════════════ */}
			<Dialog
				open={showCreate}
				onOpenChange={(open) => {
					if (!open) {
						setShowCreate(false);
						setForm(emptyForm);
						setShowAdvancedCreate(false);
					}
				}}
			>
				<DialogContent className="max-h-[calc(100svh-2rem)] max-w-lg overflow-x-hidden overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Add MCP server</DialogTitle>
						<DialogDescription>
							Connect an external MCP server so your agents can use its tools.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="grid gap-2">
								<Label htmlFor="mcp-name">Name</Label>
								<Input
									id="mcp-name"
									autoComplete="off"
									value={form.name}
									onChange={(e) => setForm({ ...form, name: e.target.value })}
									placeholder="Company tools…"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="mcp-transport">Transport</Label>
								<Select
									value={form.transport}
									onValueChange={(value) =>
										setForm({
											...form,
											transport: value,
											authMode: "none",
										})
									}
								>
									<SelectTrigger id="mcp-transport">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="streamable-http">
											Streamable HTTP
										</SelectItem>
										<SelectItem value="sse">SSE</SelectItem>
										<SelectItem value="stdio">stdio</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						{form.transport === "stdio" ? (
							<>
								<div className="grid gap-2">
									<Label htmlFor="mcp-command">Command</Label>
									<Input
										id="mcp-command"
										autoComplete="off"
										value={form.command}
										onChange={(e) =>
											setForm({ ...form, command: e.target.value })
										}
										placeholder="npx…"
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="mcp-args">Args (one per line)</Label>
									<Textarea
										id="mcp-args"
										autoComplete="off"
										value={form.args}
										onChange={(e) => setForm({ ...form, args: e.target.value })}
										placeholder={"-y\n@modelcontextprotocol/server-filesystem…"}
									/>
								</div>
							</>
						) : (
							<div className="grid gap-2">
								<Label htmlFor="mcp-url">Server URL</Label>
								<Input
									id="mcp-url"
									type="url"
									autoComplete="off"
									value={form.url}
									onChange={(e) => setForm({ ...form, url: e.target.value })}
									placeholder="https://mcp.example.com…"
								/>
							</div>
						)}

						<AuthSection
							form={form}
							setForm={setForm}
							transport={form.transport}
							prefix="mcp-create"
						/>

						{/* Approval toggle */}
						<div className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-border/70 bg-background/70 p-3">
							<div>
								<p className="text-sm font-medium">Require approval</p>
								<p className="text-xs text-muted-foreground">
									Force approval before any tool from this server runs.
								</p>
							</div>
							<Switch
								aria-label="Require approval for all MCP tools"
								checked={form.requireApproval}
								onCheckedChange={(checked) =>
									setForm({ ...form, requireApproval: checked })
								}
							/>
						</div>

						<AdvancedSection
							open={showAdvancedCreate}
							onOpenChange={setShowAdvancedCreate}
							form={form}
							setForm={setForm}
							prefix="mcp-create"
							placeholder="Use these only when the server documentation requires multiple headers or custom environment variables."
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setShowCreate(false);
								setForm(emptyForm);
								setShowAdvancedCreate(false);
							}}
						>
							Cancel
						</Button>
						<Button
							disabled={busy || !form.name.trim()}
							onClick={() => void createServer()}
						>
							{busy ? (
								<Loader2 className="animate-spin" aria-hidden="true" />
							) : (
								<PlusIcon data-icon="inline-start" aria-hidden="true" />
							)}
							Add Server
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ════════════════════════════════════════════
			 *  EDIT DIALOG
			 * ════════════════════════════════════════════ */}
			<Dialog
				open={Boolean(editServer)}
				onOpenChange={(open) => {
					if (!open) {
						setEditServer(null);
						setShowAdvancedEdit(false);
					}
				}}
			>
				<DialogContent className="max-h-[calc(100svh-2rem)] max-w-lg overflow-x-hidden overflow-y-auto">
					<DialogHeader className="min-w-0">
						<DialogTitle>Edit MCP server</DialogTitle>
						<DialogDescription>
							Update the configuration for{" "}
							<span className="font-medium">{editServer?.name}</span>.
						</DialogDescription>
					</DialogHeader>
					<div className="grid min-w-0 gap-4">
						<div className="grid min-w-0 gap-2">
							<Label htmlFor="mcp-edit-name">Name</Label>
							<Input
								id="mcp-edit-name"
								autoComplete="off"
								value={editForm.name}
								onChange={(e) =>
									setEditForm({ ...editForm, name: e.target.value })
								}
							/>
						</div>

						{/* Transport info (read-only) */}
						{editServer && (
							<div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
								<Badge variant="outline">
									{transportLabel(editServer.transport)}
								</Badge>
								{editServer.transport === "stdio" ? (
									<code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
										{[editServer.command, ...(editServer.argsJson ?? [])]
											.filter(Boolean)
											.join(" ")}
									</code>
								) : (
									<code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
										{editServer.url}
									</code>
								)}
							</div>
						)}

						{editServer?.transport !== "stdio" ? (
							<div className="grid min-w-0 gap-2">
								<Label htmlFor="mcp-edit-url">URL</Label>
								<Input
									id="mcp-edit-url"
									type="url"
									autoComplete="off"
									value={editForm.url}
									onChange={(e) =>
										setEditForm({ ...editForm, url: e.target.value })
									}
								/>
							</div>
						) : (
							<>
								<div className="grid gap-2">
									<Label htmlFor="mcp-edit-command">Command</Label>
									<Input
										id="mcp-edit-command"
										autoComplete="off"
										value={editForm.command}
										onChange={(e) =>
											setEditForm({ ...editForm, command: e.target.value })
										}
										placeholder="npx…"
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="mcp-edit-args">Args (one per line)</Label>
									<Textarea
										id="mcp-edit-args"
										autoComplete="off"
										value={editForm.args}
										onChange={(e) =>
											setEditForm({ ...editForm, args: e.target.value })
										}
										placeholder={"-y\n@modelcontextprotocol/server-filesystem…"}
									/>
								</div>
							</>
						)}

						{/* Approval toggle */}
						<div className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-border/70 bg-background/70 p-3">
							<div>
								<p className="text-sm font-medium">Require approval</p>
								<p className="text-xs text-muted-foreground">
									Force approval before any tool from this server runs.
								</p>
							</div>
							<Switch
								aria-label="Require approval for all MCP tools"
								checked={editForm.requireApproval}
								onCheckedChange={(checked) =>
									setEditForm({ ...editForm, requireApproval: checked })
								}
							/>
						</div>

						{/* Auth */}
						{editServer && (
							<AuthSection
								form={editForm}
								setForm={setEditForm}
								transport={editServer.transport}
								prefix="mcp-edit"
							/>
						)}

						<AdvancedSection
							open={showAdvancedEdit}
							onOpenChange={setShowAdvancedEdit}
							form={editForm}
							setForm={setEditForm}
							prefix="mcp-edit"
							placeholder="Leave these empty to keep the existing secret configuration."
						/>
					</div>
					<DialogFooter className="overflow-hidden">
						<Button
							variant="outline"
							onClick={() => {
								setEditServer(null);
								setShowAdvancedEdit(false);
							}}
						>
							Cancel
						</Button>
						<Button disabled={busy} onClick={() => void saveEdit()}>
							Save changes
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ════════════════════════════════════════════
			 *  DELETE DIALOG
			 * ════════════════════════════════════════════ */}
			<AlertDialog
				open={Boolean(deleteId)}
				onOpenChange={() => setDeleteId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove MCP server?</AlertDialogTitle>
						<AlertDialogDescription>
							Agents bound to these tools will lose access. This action cannot
							be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => deleteId && void removeServer(deleteId)}
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
