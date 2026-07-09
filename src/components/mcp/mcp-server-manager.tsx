"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";

import {
	CreateServerDialog,
	DeleteServerDialog,
	EditServerDialog,
} from "./mcp-server-manager/dialogs";
import {
	buildEnv,
	buildHeaders,
	emptyForm,
	serverFormFromServer,
	type McpServerForm,
} from "./mcp-server-manager/form";
import {
	ResourceShareDialog,
	type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
import { ServerList } from "./mcp-server-manager/server-list";
import { SystemStrip } from "./mcp-server-manager/stats";
import { ToolConnectionsPanel } from "./mcp-server-manager/tool-connections-panel";
import type {
	McpServer,
	McpTool,
	ServerStatusFilter,
} from "./mcp-server-manager/types";

export function McpServerManager() {
	const t = useTranslations("mcp.serverManager");
	const { workspaceId } = useWorkspace();
	const [servers, setServers] = useState<McpServer[]>([]);
	const [toolsByServer, setToolsByServer] = useState<Record<string, McpTool[]>>(
		{},
	);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);
	const [busy, setBusy] = useState(false);
	const [search, setSearch] = useState("");
	const [filterStatus, setFilterStatus] = useState<ServerStatusFilter>("all");
	const [showCreate, setShowCreate] = useState(false);
	const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
	const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
	const [form, setForm] = useState<McpServerForm>(emptyForm);
	const [editServer, setEditServer] = useState<McpServer | null>(null);
	const [editForm, setEditForm] = useState<McpServerForm>(emptyForm);
	const [editLoading, setEditLoading] = useState(false);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [shareResource, setShareResource] = useState<ShareableResource | null>(
		null,
	);
	const [expandedServers, setExpandedServers] = useState<
		Record<string, boolean>
	>({});
	const [toolSearch, setToolSearch] = useState<Record<string, string>>({});
	const [canManageTenantGlobals, setCanManageTenantGlobals] = useState(false);
	const [canManageMcpServers, setCanManageMcpServers] = useState(false);

	const load = useCallback(async () => {
		if (!workspaceId) return;
		setLoading(true);
		setLoadError(false);
		try {
			const permissions = await fetchWorkspacePermissions(workspaceId);
			setCanManageTenantGlobals(permissions.canManageTenantGlobals);
			setCanManageMcpServers(permissions.canManageMcpServers);
			const res = await fetch(
				`/api/workspace/mcp-servers?workspaceId=${workspaceId}`,
			);
			if (!res.ok) throw new Error(t("loadFailed"));
			const data = (await res.json()) as McpServer[];
			setServers(data);
			const entries = await Promise.all(
				data.map(async (server) => {
					const toolRes = await fetch(
						`/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`,
					);
					if (!toolRes.ok) throw new Error(t("loadFailed"));
					return [server.id, await toolRes.json()] as const;
				}),
			);
			setToolsByServer(Object.fromEntries(entries));
		} catch (error) {
			setLoadError(true);
			toast.error(error instanceof Error ? error.message : t("loadFailed"));
			return;
		} finally {
			setLoading(false);
		}
	}, [t, workspaceId]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- async MCP bootstrap
		void load();
	}, [load]);

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

	async function openEdit(server: McpServer) {
		if (!workspaceId || !server.canEdit) return;
		setEditServer(server);
		setEditForm(emptyForm);
		setEditLoading(true);
		setShowAdvancedEdit(false);
		try {
			const res = await fetch(
				`/api/workspace/mcp-servers/${server.id}?workspaceId=${workspaceId}`,
			);
			if (!res.ok) {
				throw new Error(
					((await res.json().catch(() => ({}))) as { error?: string }).error ||
						t("loadServerFailed"),
				);
			}
			const data = (await res.json()) as McpServer;
			setEditServer(data);
			setEditForm(serverFormFromServer(data, data.authHint));
		} catch (error) {
			setEditServer(null);
			toast.error(
				error instanceof Error ? error.message : t("loadServerFailed"),
			);
			return;
		} finally {
			setEditLoading(false);
		}
	}

	function closeEdit() {
		setEditServer(null);
		setEditLoading(false);
		setShowAdvancedEdit(false);
	}

	async function createServer() {
		if (!workspaceId || !canManageMcpServers || !form.name.trim()) return;
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
					args: linesFromTextarea(form.args),
					requireApproval: form.requireApproval,
					isGlobal: canManageTenantGlobals ? form.isGlobal : undefined,
					headers: buildHeaders(form),
					env: buildEnv(form),
				}),
			});
			if (!res.ok)
				throw new Error((await res.json()).error || t("createFailed"));
			setForm(emptyForm);
			setShowCreate(false);
			setShowAdvancedCreate(false);
			toast.success(t("created"));
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("createFailed"));
			return;
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
					transport: editForm.transport,
					url: editForm.url.trim() || "",
					command: editForm.command.trim() || undefined,
					args: linesFromTextarea(editForm.args),
					enabled: editServer.enabled,
					requireApproval: editForm.requireApproval,
					isGlobal: canManageTenantGlobals ? editForm.isGlobal : undefined,
					headers: buildHeaders(editForm),
					env: buildEnv(editForm),
				}),
			});
			if (!res.ok)
				throw new Error((await res.json()).error || t("updateFailed"));
			closeEdit();
			toast.success(t("updated"));
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("updateFailed"));
			return;
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
			if (!res.ok) throw new Error(t("removeFailed"));
			setDeleteId(null);
			toast.success(t("removed"));
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("removeFailed"));
			return;
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
						? t("syncSuccess", { count: data.discovered })
						: t("syncEmpty"),
				);
				await load();
			} else {
				toast.error(data.error || t("syncFailed"));
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("syncFailed"));
		} finally {
			setBusy(false);
		}
	}

	async function test(serverId: string) {
		if (!workspaceId) return;
		try {
			const res = await fetch(
				`/api/workspace/mcp-servers/${serverId}/test?workspaceId=${workspaceId}`,
				{ method: "POST" },
			);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || t("connectionFailed"));
			toast.success(data.message || t("connectionOk"));
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("connectionFailed"),
			);
		}
	}

	async function patchServer(server: McpServer, body: Record<string, unknown>) {
		if (!workspaceId || !server.canEdit) return;
		try {
			const res = await fetch(`/api/workspace/mcp-servers/${server.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, ...body }),
			});
			if (!res.ok) throw new Error(t("updateFailed"));
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("updateFailed"));
		}
	}

	async function patchTool(
		serverId: string,
		toolId: string,
		body: Record<string, unknown>,
	) {
		if (!workspaceId) return;
		try {
			const res = await fetch(
				`/api/workspace/mcp-servers/${serverId}/tools/${toolId}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId, ...body }),
				},
			);
			if (!res.ok) throw new Error(t("updateToolFailed"));
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("updateToolFailed"),
			);
		}
	}

	return (
		<div className="space-y-6">
			<div className="rounded-xl border bg-card p-5 sm:p-6">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h2 className="text-xl font-semibold tracking-tight">
							{t("title")}
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("description")}
						</p>
					</div>
					<Button
						size="sm"
						disabled={loading || loadError || !canManageMcpServers}
						onClick={() => setShowCreate(true)}
					>
						<PlusIcon className="size-4" aria-hidden="true" />
						{t("addServer")}
					</Button>
				</div>
				<AdvancedSection
					label={t("serverHealth")}
					hint={t("serverHealthHint")}
					storageKey="advanced:mcp-health"
					className="mt-5 border-border/50 bg-muted/20"
				>
					<SystemStrip servers={servers} toolsByServer={toolsByServer} />
				</AdvancedSection>
			</div>

			{loadError ? (
				<div
					className="rounded-xl border border-destructive/25 bg-destructive/5 p-4"
					role="alert"
				>
					<p className="text-sm font-medium">{t("loadFailed")}</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="mt-3"
						onClick={() => void load()}
					>
						{t("retry")}
					</Button>
				</div>
			) : null}

			{!loadError ? (
				<ToolConnectionsPanel
					workspaceId={workspaceId}
					servers={servers}
					toolsByServer={toolsByServer}
					canManageMcpServers={canManageMcpServers}
					canManageWorkspaceConnections={canManageTenantGlobals}
					onSyncServerAction={(serverId) => sync(serverId)}
				/>
			) : null}

			{!loadError ? (
				<ServerList
					canManageServers={canManageMcpServers}
					servers={servers}
					filteredServers={filteredServers}
					toolsByServer={toolsByServer}
					loading={loading}
					search={search}
					filterStatus={filterStatus}
					expandedServers={expandedServers}
					toolSearch={toolSearch}
					onSearchChangeAction={setSearch}
					onFilterChangeAction={setFilterStatus}
					onAddServerAction={() => setShowCreate(true)}
					onExpandedServersChangeAction={setExpandedServers}
					onToolSearchChangeAction={setToolSearch}
					onEditServerAction={(server) => void openEdit(server)}
					onDeleteServerAction={setDeleteId}
					onTestServerAction={(serverId) => void test(serverId)}
					onSyncServerAction={(serverId) => void sync(serverId)}
					onShareServerAction={(server) =>
						setShareResource({
							kind: "mcp_server",
							id: server.id,
							name: server.name,
							description: null,
						})
					}
					onShareToolAction={(server, tool) =>
						setShareResource({
							kind: "mcp_tool",
							id: tool.id,
							name: `${server.name} — ${tool.name}`,
							description: tool.description,
						})
					}
					onToggleEnabledAction={(server, enabled) =>
						void patchServer(server, { enabled })
					}
					onToggleServerApprovalAction={(server, requireApproval) =>
						void patchServer(server, { requireApproval })
					}
					onToggleToolAction={(serverId, toolId, enabled) =>
						void patchTool(serverId, toolId, { enabled })
					}
					onToggleToolActionApproval={(serverId, toolId, requireApproval) =>
						void patchTool(serverId, toolId, { requireApproval })
					}
				/>
			) : null}

			<CreateServerDialog
				open={showCreate}
				busy={busy}
				canManageGlobal={canManageTenantGlobals}
				form={form}
				setForm={setForm}
				showAdvanced={showAdvancedCreate}
				onAdvancedChange={setShowAdvancedCreate}
				onOpenChange={setShowCreate}
				onCreate={() => void createServer()}
			/>
			<EditServerDialog
				server={editServer}
				busy={busy}
				canManageGlobal={canManageTenantGlobals}
				loading={editLoading}
				form={editForm}
				setForm={setEditForm}
				showAdvanced={showAdvancedEdit}
				onAdvancedChange={setShowAdvancedEdit}
				onClose={closeEdit}
				onSave={() => void saveEdit()}
			/>
			<DeleteServerDialog
				deleteId={deleteId}
				busy={busy}
				onClose={() => setDeleteId(null)}
				onDelete={(id) => void removeServer(id)}
			/>
			<ResourceShareDialog
				resource={shareResource}
				workspaceId={workspaceId}
				open={shareResource !== null}
				onCloseAction={() => setShareResource(null)}
			/>
		</div>
	);
}

function linesFromTextarea(value: string) {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}
