"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, NetworkIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface McpServer {
	id: string;
	name: string;
	transport: string;
	url: string | null;
	healthStatus: string | null;
	enabled: boolean;
	lastCheckedAt: string | null;
}
interface McpTool {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
}

function getBrowserWorkspaceId() {
	if (typeof window === "undefined") return null;
	return window.sessionStorage.getItem("active_workspace_id");
}

export default function McpPage() {
	const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
		getBrowserWorkspaceId(),
	);
	const [servers, setServers] = useState<McpServer[]>([]);
	const [toolsByServer, setToolsByServer] = useState<Record<string, McpTool[]>>(
		{},
	);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [form, setForm] = useState({
		name: "",
		transport: "streamable-http",
		url: "",
	});

	useEffect(() => {
		if (workspaceId) return;
		void fetch("/api/workspaces")
			.then((res) => res.json())
			.then((data) => {
				const id = Array.isArray(data)
					? data[0]?.workspace?.id || data[0]?.id
					: null;
				if (id) {
					setWorkspaceId(id);
					window.sessionStorage.setItem("active_workspace_id", id);
				}
			})
			.catch(() => toast.error("Unable to load workspace"));
	}, [workspaceId]);

	const load = useCallback(async () => {
		if (!workspaceId) return;
		await Promise.resolve();
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
		queueMicrotask(() => void load());
	}, [load]);

	async function createServer() {
		if (!workspaceId || !form.name.trim()) return;
		setCreating(true);
		try {
			const res = await fetch("/api/workspace/mcp-servers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					name: form.name.trim(),
					transport: form.transport,
					url: form.url.trim() || undefined,
				}),
			});
			if (!res.ok)
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Failed to create server",
				);
			setForm({ name: "", transport: "streamable-http", url: "" });
			toast.success("MCP server added");
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create server",
			);
		} finally {
			setCreating(false);
		}
	}

	async function sync(serverId: string) {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/mcp-servers/${serverId}/tools?workspaceId=${workspaceId}`,
			{ method: "POST" },
		);
		if (res.ok) {
			toast.success("MCP sync completed");
			await load();
		} else toast.error("MCP sync failed");
	}

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col gap-2">
				<div className="section-kicker">MCP</div>
				<h1 className="text-2xl font-semibold sm:text-3xl">MCP servers</h1>
				<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
					Register workspace-scoped MCP servers, sync tools, and keep tool
					execution permissioned.
				</p>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Add MCP server</CardTitle>
					<CardDescription>
						Secrets are encrypted at rest. HTTP transports support lightweight
						tools/list sync.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-[1fr_12rem_1fr_auto] sm:items-end">
					<div className="grid gap-2">
						<Label>Name</Label>
						<Input
							value={form.name}
							onChange={(event) =>
								setForm({ ...form, name: event.target.value })
							}
							placeholder="Company tools"
						/>
					</div>
					<div className="grid gap-2">
						<Label>Transport</Label>
						<select
							className="h-10 rounded-md border bg-background px-3 text-sm"
							value={form.transport}
							onChange={(event) =>
								setForm({ ...form, transport: event.target.value })
							}
						>
							<option value="streamable-http">Streamable HTTP</option>
							<option value="sse">SSE</option>
							<option value="stdio">stdio</option>
						</select>
					</div>
					<div className="grid gap-2">
						<Label>URL</Label>
						<Input
							value={form.url}
							onChange={(event) =>
								setForm({ ...form, url: event.target.value })
							}
							placeholder="https://mcp.example.com"
						/>
					</div>
					<Button
						onClick={createServer}
						disabled={creating || !form.name.trim()}
					>
						{creating ? (
							<Loader2 className="animate-spin" />
						) : (
							<PlusIcon data-icon="inline-start" />
						)}
						Add
					</Button>
				</CardContent>
			</Card>
			{loading ? (
				<div className="flex justify-center py-12">
					<Loader2 className="animate-spin" />
				</div>
			) : (
				<div className="grid gap-4">
					{servers.map((server) => (
						<Card key={server.id}>
							<CardHeader>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<CardTitle className="flex items-center gap-2">
											<NetworkIcon className="size-5" />
											{server.name}
										</CardTitle>
										<CardDescription>
											{server.url || server.transport}
										</CardDescription>
									</div>
									<div className="flex items-center gap-2">
										<Badge variant={server.enabled ? "secondary" : "outline"}>
											{server.enabled ? "enabled" : "disabled"}
										</Badge>
										<Badge variant="outline">
											{server.healthStatus || "unknown"}
										</Badge>
										<Button
											size="sm"
											variant="outline"
											onClick={() => sync(server.id)}
										>
											<RefreshCwIcon data-icon="inline-start" />
											Sync
										</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent className="grid gap-2 text-sm text-muted-foreground">
								{(toolsByServer[server.id] ?? []).length === 0 ? (
									<p>No discovered tools yet.</p>
								) : (
									toolsByServer[server.id].map((tool) => (
										<div key={tool.id} className="rounded-lg border p-3">
											<span className="font-medium text-foreground">
												{tool.name}
											</span>
											{tool.description ? <p>{tool.description}</p> : null}
										</div>
									))
								)}
							</CardContent>
						</Card>
					))}
					{servers.length === 0 ? (
						<Card>
							<CardContent className="p-8 text-center text-sm text-muted-foreground">
								No MCP servers registered.
							</CardContent>
						</Card>
					) : null}
				</div>
			)}
		</div>
	);
}
