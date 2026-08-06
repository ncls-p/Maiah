import { KeyRoundIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogTitle } from "@/components/ui/dialog";

import { ResourceShareDialog } from "@/components/marketplace/resource-share-dialog";
import type { useMcpServerManagerController } from "./mcp-server-manager.mcp-server-manager";
import { SERVERS_PAGE_SIZE } from "./mcp-server-manager.servers-page-size";
import { CreateServerDialog,DeleteServerDialog,EditServerDialog } from "./mcp-server-manager/dialogs";
import { ServerList } from "./mcp-server-manager/server-list";
import { ToolConnectionsPanel } from "./mcp-server-manager/tool-connections-panel";

type Model = Extract<ReturnType<typeof useMcpServerManagerController>, { kind: "ready" }>;
export function McpServerManagerView({ model }: { model: Model }) {
  const { busy, canManageMcpServers, canManageTenantGlobals, closeEdit, createServer, deleteId, editForm, editLoading, editServer, expandedServers, filterStatus, filteredServers, form, load, loadError, loading, openEdit, patchServer, patchTool, removeServer, retryDiscovery, saveEdit, search, servers, setDeleteId, setEditForm, setExpandedServers, setFilterStatus, setForm, setSearch, setShareResource, setShowAdvancedCreate, setShowAdvancedEdit, setShowConnections, setShowCreate, setToolSearch, setVisibleCount, shareResource, showAdvancedCreate, showAdvancedEdit, showConnections, showCreate, t, toolSearch, toolsByServer, visibleCount, visibleServers, workspaceId } = model;
  return (
    <div className="space-y-3">
      {loadError ? (
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4" role="alert">
          <p className="text-sm font-medium">{t("loadFailed")}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
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
          onShowMoreAction={() => setVisibleCount((current) => current + SERVERS_PAGE_SIZE)}
          onExpandedServersChangeAction={setExpandedServers}
          onToolSearchChangeAction={setToolSearch}
          onEditServerAction={(server) => void openEdit(server)}
          onDeleteServerAction={setDeleteId}
          onRetryDiscoveryAction={(serverId) => void retryDiscovery(serverId)}
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
          onToggleEnabledAction={(server, enabled) => void patchServer(server, { enabled })}
          onToggleServerApprovalAction={(server, requireApproval) => void patchServer(server, { requireApproval })}
          onToggleToolAction={(serverId, toolId, enabled) => void patchTool(serverId, toolId, { enabled })}
          onToggleToolActionApproval={(serverId, toolId, requireApproval) => void patchTool(serverId, toolId, { requireApproval })}
        />
      ) : null}

      <Dialog open={showConnections} onOpenChange={setShowConnections}>
        <DialogContent className="top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 p-4 sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[min(88dvh,820px)] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:p-6">
          <div className="pr-10">
            <div className="flex items-center gap-2">
              <KeyRoundIcon className="size-4 text-primary" aria-hidden="true" />
              <DialogTitle>{t("connections")}</DialogTitle>
            </div>
            <DialogDescription className="mt-1">{t("connectionsDescription")}</DialogDescription>
          </div>
          {showConnections ? <ToolConnectionsPanel workspaceId={workspaceId} servers={servers} toolsByServer={toolsByServer} canManageMcpServers={canManageMcpServers} canManageWorkspaceConnections={canManageTenantGlobals} embedded /> : null}
        </DialogContent>
      </Dialog>

      <CreateServerDialog open={showCreate} busy={busy} canManageGlobal={canManageTenantGlobals} form={form} setForm={setForm} showAdvanced={showAdvancedCreate} onAdvancedChange={setShowAdvancedCreate} onOpenChange={setShowCreate} onCreate={() => void createServer()} />
      <EditServerDialog server={editServer} busy={busy} canManageGlobal={canManageTenantGlobals} loading={editLoading} form={editForm} setForm={setEditForm} showAdvanced={showAdvancedEdit} onAdvancedChange={setShowAdvancedEdit} onClose={closeEdit} onSave={() => void saveEdit()} />
      <DeleteServerDialog deleteId={deleteId} busy={busy} onClose={() => setDeleteId(null)} onDelete={(id) => void removeServer(id)} />
      <ResourceShareDialog resource={shareResource} workspaceId={workspaceId} open={shareResource !== null} onCloseAction={() => setShareResource(null)} />
    </div>
  );
}
