"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import { ResourceAccessOptions, ResourceAccessSelection } from "@/modules/iam/resource-access-scope";
import { type ShareableResource, ResourceShareDialog } from "@/components/marketplace/resource-share-dialog";
import { linesFromTextarea } from "./mcp-server-manager.lines-from-textarea";
import { SERVERS_PAGE_SIZE } from "./mcp-server-manager.servers-page-size";
import { buildEnv, buildHeaders, emptyForm, serverFormFromServer, type McpServerForm } from "./mcp-server-manager/form";
import { McpServer, McpTool, ServerStatusFilter } from "./mcp-server-manager/types";
import { KeyRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ResourceAccessDialog } from "@/components/resource-access-dialog";
import { CreateServerDialog, DeleteServerDialog, EditServerDialog } from "./mcp-server-manager/dialogs";
import { ServerList } from "./mcp-server-manager/server-list";
import { ToolConnectionsPanel } from "./mcp-server-manager/tool-connections-panel";

export function useMcpServerManagerController() {
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
  const [visibleCount, setVisibleCount] = useState(SERVERS_PAGE_SIZE);
  const [showCreate, setShowCreate] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
  const [form, setForm] = useState<McpServerForm>(emptyForm);
  const [editServer, setEditServer] = useState<McpServer | null>(null);
  const [accessServer, setAccessServer] = useState<McpServer | null>(null);
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
  const [resourceAccessOptions, setResourceAccessOptions] =
    useState<ResourceAccessOptions | null>(null);
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
      setResourceAccessOptions(permissions.resourceAccessOptions ?? null);
      const res = await fetch(
        `/api/workspace/mcp-servers?workspaceId=${workspaceId}`,
      );
      if (!res.ok) throw new Error(t("loadFailed"));
      let data = (await res.json()) as McpServer[];
      const serversPendingInitialDiscovery = data.filter(
        (server) =>
          server.canEdit &&
          server.transport !== "stdio" &&
          (!server.healthStatus || server.healthStatus === "unknown"),
      );
      if (
        permissions.canManageMcpServers &&
        serversPendingInitialDiscovery.length > 0
      ) {
        await Promise.all(
          serversPendingInitialDiscovery.map((server) =>
            fetch(
              `/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`,
              { method: "POST" },
            ),
          ),
        );
        const refreshedRes = await fetch(
          `/api/workspace/mcp-servers?workspaceId=${workspaceId}`,
        );
        if (refreshedRes.ok) {
          data = (await refreshedRes.json()) as McpServer[];
        }
      }
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
  const visibleServers = filteredServers.slice(0, visibleCount);

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

  async function openAccess(server: McpServer) {
    if (!workspaceId || !server.canEdit) return;
    try {
      const response = await fetch(
        `/api/workspace/mcp-servers/${server.id}?workspaceId=${workspaceId}`,
      );
      const data = (await response.json().catch(() => ({}))) as McpServer & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("loadServerFailed"));
      }
      setAccessServer(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("loadServerFailed"),
      );
    }
  }

  async function saveServerAccess(
    server: McpServer,
    selection: ResourceAccessSelection,
  ) {
    if (!workspaceId) return;
    const response = await fetch(`/api/workspace/mcp-servers/${server.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        accessScope: selection.scope,
        accessTeamId: selection.scope === "team" ? selection.teamId : undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as McpServer & {
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || t("updateFailed"));
    setAccessServer({ ...server, ...data, access: selection });
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
          accessScope: form.accessScope,
          accessTeamId:
            form.accessScope === "team" ? form.accessTeamId : undefined,
          headers: buildHeaders(form),
          env: buildEnv(form),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as McpServer & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || t("createFailed"));
      setForm(emptyForm);
      setShowCreate(false);
      setShowAdvancedCreate(false);
      setExpandedServers((current) => ({ ...current, [data.id]: true }));
      notifyDiscoveryResult(data.discovery, "created");
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
          accessScope: editForm.accessScope,
          accessTeamId:
            editForm.accessScope === "team" ? editForm.accessTeamId : undefined,
          headers: buildHeaders(editForm),
          env: buildEnv(editForm),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as McpServer & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || t("updateFailed"));
      closeEdit();
      notifyDiscoveryResult(data.discovery, "updated");
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

  async function retryDiscovery(serverId: string) {
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
            ? t("discoverySuccess", { count: data.discovered })
            : t("discoveryEmpty"),
        );
        await load();
      } else {
        toast.error(data.error || t("discoveryFailed"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("discoveryFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  function notifyDiscoveryResult(
    discovery: McpServer["discovery"],
    fallback: "created" | "updated",
  ) {
    if (!discovery || discovery.status === "manual") {
      toast.success(t(fallback));
    } else if (discovery.status === "unhealthy") {
      toast.warning(t("savedDiscoveryFailed"));
    } else if (discovery.discovered > 0) {
      toast.success(t("savedWithTools", { count: discovery.discovered }));
    } else {
      toast.success(t("savedWithoutTools"));
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

  return {
    kind: "ready",
    accessServer,
    busy,
    canManageMcpServers,
    canManageTenantGlobals,
    closeEdit,
    createServer,
    deleteId,
    editForm,
    editLoading,
    editServer,
    expandedServers,
    filterStatus,
    filteredServers,
    form,
    load,
    loadError,
    loading,
    openAccess,
    openEdit,
    patchServer,
    patchTool,
    removeServer,
    resourceAccessOptions,
    retryDiscovery,
    saveEdit,
    saveServerAccess,
    search,
    servers,
    setDeleteId,
    setEditForm,
    setExpandedServers,
    setFilterStatus,
    setForm,
    setAccessServer,
    setSearch,
    setShareResource,
    setShowAdvancedCreate,
    setShowAdvancedEdit,
    setShowConnections,
    setShowCreate,
    setToolSearch,
    setVisibleCount,
    shareResource,
    showAdvancedCreate,
    showAdvancedEdit,
    showConnections,
    showCreate,
    t,
    toolSearch,
    toolsByServer,
    visibleCount,
    visibleServers,
    workspaceId,
  } as const;
}

export function McpServerManager(
  ...args: Parameters<typeof useMcpServerManagerController>
) {
  const model = useMcpServerManagerController(...args);
  if (!("kind" in model)) return model;
  return <McpServerManagerView model={model} />;
}


type Model = Extract<
  ReturnType<typeof useMcpServerManagerController>,
  { kind: "ready" }
>;
export function McpServerManagerView({ model }: { model: Model }) {
  const {
    accessServer,
    busy,
    canManageMcpServers,
    canManageTenantGlobals,
    closeEdit,
    createServer,
    deleteId,
    editForm,
    editLoading,
    editServer,
    expandedServers,
    filterStatus,
    filteredServers,
    form,
    load,
    loadError,
    loading,
    openAccess,
    openEdit,
    patchServer,
    patchTool,
    removeServer,
    resourceAccessOptions,
    retryDiscovery,
    saveEdit,
    saveServerAccess,
    search,
    servers,
    setAccessServer,
    setDeleteId,
    setEditForm,
    setExpandedServers,
    setFilterStatus,
    setForm,
    setSearch,
    setShareResource,
    setShowAdvancedCreate,
    setShowAdvancedEdit,
    setShowConnections,
    setShowCreate,
    setToolSearch,
    setVisibleCount,
    shareResource,
    showAdvancedCreate,
    showAdvancedEdit,
    showConnections,
    showCreate,
    t,
    toolSearch,
    toolsByServer,
    visibleCount,
    visibleServers,
    workspaceId,
  } = model;
  return (
    <div className="space-y-3">
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
        <ServerList
          canManageServers={canManageMcpServers}
          servers={servers}
          filteredServers={visibleServers}
          filteredServerCount={filteredServers.length}
          visibleCount={visibleCount}
          toolsByServer={toolsByServer}
          loading={loading}
          search={search}
          filterStatus={filterStatus}
          expandedServers={expandedServers}
          toolSearch={toolSearch}
          onSearchChangeAction={(value) => {
            setSearch(value);
            setVisibleCount(SERVERS_PAGE_SIZE);
          }}
          onFilterChangeAction={(value) => {
            setFilterStatus(value);
            setVisibleCount(SERVERS_PAGE_SIZE);
          }}
          onAddServerAction={() => setShowCreate(true)}
          onOpenConnectionsAction={() => setShowConnections(true)}
          onShowMoreAction={() =>
            setVisibleCount((current) => current + SERVERS_PAGE_SIZE)
          }
          onExpandedServersChangeAction={setExpandedServers}
          onToolSearchChangeAction={setToolSearch}
          onEditServerAction={(server) => void openEdit(server)}
          onDeleteServerAction={setDeleteId}
          onRetryDiscoveryAction={(serverId) => void retryDiscovery(serverId)}
          onShareServerAction={(server) => void openAccess(server)}
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

      <Dialog open={showConnections} onOpenChange={setShowConnections}>
        <DialogContent className="top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 p-4 sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[min(88dvh,820px)] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:p-6">
          <div className="pr-10">
            <div className="flex items-center gap-2">
              <KeyRoundIcon
                className="size-4 text-primary"
                aria-hidden="true"
              />
              <DialogTitle>{t("connections")}</DialogTitle>
            </div>
            <DialogDescription className="mt-1">
              {t("connectionsDescription")}
            </DialogDescription>
          </div>
          {showConnections ? (
            <ToolConnectionsPanel
              workspaceId={workspaceId}
              servers={servers}
              toolsByServer={toolsByServer}
              canManageMcpServers={canManageMcpServers}
              canManageWorkspaceConnections={canManageTenantGlobals}
              embedded
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <CreateServerDialog
        open={showCreate}
        busy={busy}
        canManageGlobal={canManageTenantGlobals}
        resourceAccessOptions={resourceAccessOptions}
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
        resourceAccessOptions={resourceAccessOptions}
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
      {resourceAccessOptions && workspaceId ? (
        <ResourceAccessDialog
          open={accessServer !== null}
          workspaceId={workspaceId}
          resource={
            accessServer
              ? {
                  id: accessServer.id,
                  name: accessServer.name,
                  type: "mcp_server",
                }
              : null
          }
          selection={accessServer?.access ?? { scope: "private" }}
          options={resourceAccessOptions}
          onOpenChangeAction={(open) => {
            if (!open) setAccessServer(null);
          }}
          onScopeSaveAction={(selection) =>
            accessServer
              ? saveServerAccess(accessServer, selection)
              : Promise.resolve()
          }
          onSavedAction={load}
        />
      ) : null}
      <ResourceShareDialog
        resource={shareResource}
        workspaceId={workspaceId}
        open={shareResource !== null}
        onCloseAction={() => setShareResource(null)}
      />
    </div>
  );
}

