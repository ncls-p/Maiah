"use client";

import { LockKeyholeIcon,UnplugIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback,useEffect,useMemo,useState } from "react";
import { toast } from "sonner";

import { Alert,AlertDescription,AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardDescription,CardHeader,CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { ConnectionDialog } from "./tool-connections-panel.connection-dialog";
import { ConnectorCard } from "./tool-connections-panel.connector-card";
import { buildConnectionPayload,validateForm } from "./tool-connections-panel.initial-values";
import { ConnectionFormState,SERVICE_NOW_CONFIG_SCHEMA,SERVICE_NOW_DEFAULT_CONFIG,SERVICE_NOW_SECRET_SCHEMA,ToolConnection,ToolConnectionsPanelProps,ToolConnector } from "./tool-connections-panel.json-record";
import { ProvisionServiceNowConnectorCard } from "./tool-connections-panel.provision-service-now-connector-card";
import { ToolConnectionsSkeleton,createFormFromConnection,createFormFromConnector,isServiceNowGatewayServer } from "./tool-connections-panel.schema-field-control";

export function ToolConnectionsPanel({ workspaceId, servers, toolsByServer, canManageMcpServers, canManageWorkspaceConnections, embedded = false }: ToolConnectionsPanelProps) {
  const t = useTranslations("mcp.toolConnections");
  const [connectors, setConnectors] = useState<ToolConnector[]>([]);
  const [connections, setConnections] = useState<ToolConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [activeForm, setActiveForm] = useState<ConnectionFormState | null>(null);
  const [provisioningServerId, setProvisioningServerId] = useState("");

  const serverById = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers]);
  const serviceNowServers = useMemo(() => servers.filter(isServiceNowGatewayServer), [servers]);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [connectorRes, connectionRes] = await Promise.all([fetch(`/api/workspace/tool-connectors?workspaceId=${workspaceId}`), fetch(`/api/workspace/tool-connections?workspaceId=${workspaceId}`)]);
      if (!connectorRes.ok || !connectionRes.ok) {
        throw new Error(t("loadFailed"));
      }
      setConnectors((await connectorRes.json()) as ToolConnector[]);
      setConnections((await connectionRes.json()) as ToolConnection[]);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async tool-connection bootstrap
    void load();
  }, [load]);

  function openCreate(connector: ToolConnector) {
    setActiveForm(createFormFromConnector(connector));
    setFormOpen(true);
  }

  function openEdit(connector: ToolConnector, connection: ToolConnection) {
    setActiveForm(createFormFromConnection(connector, connection));
    setFormOpen(true);
  }

  async function saveConnection() {
    if (!workspaceId || !activeForm) return;
    const connector = connectors.find((item) => item.id === activeForm.connectorId);
    if (!connector) return;

    const validationError = validateForm(connector, activeForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const payload = buildConnectionPayload(workspaceId, connector, activeForm);
    setBusy(true);
    try {
      const res = await fetch(activeForm.id ? `/api/workspace/tool-connections/${activeForm.id}` : "/api/workspace/tool-connections", {
        method: activeForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || t("saveFailed"));
      toast.success(activeForm.id ? t("updated") : t("created"));
      setFormOpen(false);
      setActiveForm(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function provisionServiceNowConnector(serverId: string) {
    if (!workspaceId || !serverId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/tool-connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          key: "servicenow",
          name: "ServiceNow",
          description: "Per-user ServiceNow connections routed through the MCP gateway.",
          kind: "mcp",
          mcpServerId: serverId,
          configSchema: SERVICE_NOW_CONFIG_SCHEMA,
          secretSchema: SERVICE_NOW_SECRET_SCHEMA,
          defaultConfig: SERVICE_NOW_DEFAULT_CONFIG,
          isGlobal: canManageWorkspaceConnections,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || t("provisionFailed"));
      toast.success(t("provisioned"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("provisionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(connection: ToolConnection) {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/tool-connections/${connection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, isDefault: true }),
      });
      if (!res.ok) throw new Error(t("defaultFailed"));
      toast.success(t("defaultUpdated"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("defaultFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeConnection(connection: ToolConnection) {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/tool-connections/${connection.id}?workspaceId=${workspaceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("removeFailed"));
      toast.success(t("removed"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  const connectorsWithServers = connectors.filter((connector) => connector.enabled || connector.mcpServerId);
  const serviceNowConnectors = connectors.filter((connector) => connector.key === "servicenow");
  const provisionCandidateServers = serviceNowServers.length ? serviceNowServers : servers.length === 1 ? servers : [];
  const requestedProvisioningServerId = provisioningServerId || serviceNowConnectors.find((connector) => connector.mcpServerId)?.mcpServerId || "";
  const selectedProvisioningServerId = provisionCandidateServers.some((server) => server.id === requestedProvisioningServerId) ? requestedProvisioningServerId : (provisionCandidateServers[0]?.id ?? "");
  const selectedProvisioningToolCount = selectedProvisioningServerId ? (toolsByServer[selectedProvisioningServerId]?.length ?? 0) : 0;
  const shouldShowServiceNowProvision = serviceNowConnectors.length === 0 && (connectorsWithServers.length === 0 || provisionCandidateServers.length > 0);

  const content = (
    <>
      {!embedded ? (
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
      ) : null}
      <CardContent className={cn("flex flex-col gap-4", embedded && "p-4")}>
        <Alert className={cn(embedded && "py-3")}>
          <LockKeyholeIcon aria-hidden="true" />
          <AlertTitle>{t("privacyTitle")}</AlertTitle>
          <AlertDescription>{t("privacyDescription")}</AlertDescription>
        </Alert>

        {loading ? (
          <ToolConnectionsSkeleton />
        ) : loadError ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-center" role="alert">
            <p className="text-sm font-medium">{t("loadFailed")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("loadFailedDescription")}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              {t("retry")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {shouldShowServiceNowProvision ? (
              <ProvisionServiceNowConnectorCard
                servers={provisionCandidateServers}
                busy={busy}
                canManageMcpServers={canManageMcpServers}
                selectedServerId={selectedProvisioningServerId}
                selectedToolCount={selectedProvisioningToolCount}
                onServerChangeAction={setProvisioningServerId}
                onProvisionAction={(serverId) => void provisionServiceNowConnector(serverId)}
              />
            ) : null}

            {connectorsWithServers.length === 0 && !shouldShowServiceNowProvision ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
                <UnplugIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                <p className="font-medium">{t("emptyTitle")}</p>
                <p className="max-w-md text-sm text-muted-foreground">{t("emptyDescription")}</p>
              </div>
            ) : null}

            {connectorsWithServers.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {connectorsWithServers.map((connector) => {
                  const connectorConnections = connections.filter((connection) => connection.connectorId === connector.id);
                  const toolCount = connector.mcpServerId ? (toolsByServer[connector.mcpServerId]?.length ?? 0) : undefined;
                  return (
                    <ConnectorCard
                      key={connector.id}
                      connector={connector}
                      connections={connectorConnections}
                      server={connector.mcpServerId ? serverById.get(connector.mcpServerId) : undefined}
                      toolCount={toolCount}
                      busy={busy}
                      canManageWorkspaceConnections={canManageWorkspaceConnections}
                      onCreateAction={openCreate}
                      onEditAction={openEdit}
                      onMakeDefaultAction={(connection) => void makeDefault(connection)}
                      onRemoveAction={(connection) => void removeConnection(connection)}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>

      <ConnectionDialog
        open={formOpen}
        busy={busy}
        form={activeForm}
        connector={activeForm ? (connectors.find((item) => item.id === activeForm.connectorId) ?? null) : null}
        canManageWorkspaceConnections={canManageWorkspaceConnections}
        onOpenChangeAction={(open) => {
          setFormOpen(open);
          if (!open) setActiveForm(null);
        }}
        onFormChangeAction={setActiveForm}
        onSaveAction={() => void saveConnection()}
      />
    </>
  );

  if (embedded) {
    return <div className="overflow-hidden rounded-2xl border border-border/65 bg-card/85">{content}</div>;
  }

  return <Card>{content}</Card>;
}
