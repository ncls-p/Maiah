"use client";

import { LockKeyholeIcon,PlusIcon,ServerIcon,UnplugIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert,AlertDescription,AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";

import type { McpServer } from "./types";

export function ProvisionServiceNowConnectorCard({ servers, busy, canManageMcpServers, selectedServerId, selectedToolCount, onServerChangeAction, onProvisionAction }: { servers: McpServer[]; busy: boolean; canManageMcpServers: boolean; selectedServerId: string; selectedToolCount: number; onServerChangeAction: (serverId: string) => void; onProvisionAction: (serverId: string) => void }) {
  const t = useTranslations("mcp.toolConnections");
  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
        <UnplugIcon className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">{t("emptyTitle")}</p>
        <p className="max-w-md text-sm text-muted-foreground">{t("serviceNowEmptyDescription")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-dashed p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border bg-muted/40 p-2">
          <ServerIcon className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="font-medium">{t("provisionTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("provisionDescription")}</p>
        </div>
      </div>
      {!canManageMcpServers ? (
        <Alert>
          <LockKeyholeIcon aria-hidden="true" />
          <AlertTitle>{t("adminRequiredTitle")}</AlertTitle>
          <AlertDescription>{t("adminRequiredDescription")}</AlertDescription>
        </Alert>
      ) : null}
      {selectedServerId && selectedToolCount === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="text-muted-foreground">{t("noSyncedToolsDescription")}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={selectedServerId} onValueChange={onServerChangeAction}>
          <SelectTrigger className="w-full" aria-label={t("serverLabel")}>
            <SelectValue placeholder={t("serverPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {servers.map((server) => (
              <SelectItem key={server.id} value={server.id}>
                {server.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="sm:w-fit" onClick={() => onProvisionAction(selectedServerId)} disabled={busy || !selectedServerId || !canManageMcpServers}>
          <PlusIcon aria-hidden="true" />
          {t("provisionAction")}
        </Button>
      </div>
    </div>
  );
}
