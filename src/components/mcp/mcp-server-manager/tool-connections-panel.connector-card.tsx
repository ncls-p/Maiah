"use client";

import { CheckCircle2Icon,KeyRoundIcon,PencilIcon,PlusIcon,Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ToolConnection,ToolConnector } from "./tool-connections-panel.json-record";
import { ConnectionConfigSummary,StatusBadge } from "./tool-connections-panel.schema-field-control";
import type { McpServer } from "./types";

export function ConnectorCard({ connector, connections, server, toolCount, busy, canManageWorkspaceConnections, onCreateAction, onEditAction, onMakeDefaultAction, onRemoveAction }: { connector: ToolConnector; connections: ToolConnection[]; server?: McpServer; toolCount?: number; busy: boolean; canManageWorkspaceConnections: boolean; onCreateAction: (connector: ToolConnector) => void; onEditAction: (connector: ToolConnector, connection: ToolConnection) => void; onMakeDefaultAction: (connection: ToolConnection) => void; onRemoveAction: (connection: ToolConnection) => void }) {
  const t = useTranslations("mcp.toolConnections");
  return (
    <div className="flex min-h-72 flex-col gap-4 rounded-xl border bg-background/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{connector.name}</h3>
            <Badge variant={connector.enabled ? "secondary" : "outline"}>{connector.enabled ? t("enabled") : t("disabled")}</Badge>
            {connector.isGlobal ? <Badge variant="outline">{t("global")}</Badge> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{connector.description || t("connectorFallbackDescription")}</p>
          {server ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("mcpServer")}: <span className="font-medium">{server.name}</span>
              {typeof toolCount === "number" ? <span> · {t("syncedTools", { count: toolCount })}</span> : null}
            </p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => onCreateAction(connector)} disabled={!connector.enabled || busy}>
          <PlusIcon aria-hidden="true" />
          {t("add")}
        </Button>
      </div>

      {server && toolCount === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="text-muted-foreground">{t("connectorNoToolsDescription")}</p>
        </div>
      ) : null}

      {connections.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-center">
          <KeyRoundIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">{t("noConnectionTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("noConnectionDescription")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {connections.map((connection) => {
            const editable = canManageWorkspaceConnections || connection.ownerType === "user";
            return (
              <div key={connection.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{connection.label}</p>
                      {connection.isDefault ? (
                        <Badge variant="secondary">
                          <CheckCircle2Icon aria-hidden="true" />
                          {t("default")}
                        </Badge>
                      ) : null}
                      <Badge variant="outline">{connection.ownerType === "user" ? t("personal") : t("workspace")}</Badge>
                      <StatusBadge status={connection.status} />
                      {connection.hasSecrets ? <Badge variant="outline">{t("secretsSaved")}</Badge> : null}
                    </div>
                    <ConnectionConfigSummary config={connection.config} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEditAction(connector, connection)} disabled={!editable || busy}>
                    <PencilIcon aria-hidden="true" />
                    {t("edit")}
                  </Button>
                  {connection.isDefault ? null : (
                    <Button variant="outline" size="sm" onClick={() => onMakeDefaultAction(connection)} disabled={!editable || busy}>
                      {t("makeDefault")}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => onRemoveAction(connection)} disabled={!editable || busy}>
                    <Trash2Icon aria-hidden="true" />
                    {t("remove")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
