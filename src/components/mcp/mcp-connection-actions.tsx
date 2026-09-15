"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCwIcon, KeyRoundIcon } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { McpOAuthDialog } from "./mcp-oauth-dialog";
export function McpConnectionActions({
  serverId,
  canEdit,
  enabled,
  onSync,
}: {
  serverId: string;
  canEdit: boolean;
  enabled: boolean;
  onSync: () => void | Promise<void>;
}) {
  const t = useTranslations("mcp.oauth");
  const { workspaceId } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  if (!workspaceId) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <p className="text-xs text-muted-foreground">{t("autoSync")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={syncing || !canEdit || !enabled}
          onClick={async () => {
            setSyncing(true);
            try {
              await onSync();
            } finally {
              setSyncing(false);
            }
          }}
        >
          <RefreshCwIcon
            aria-hidden="true"
            className={syncing ? "animate-spin" : undefined}
          />
          {t(syncing ? "syncing" : "resync")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!enabled}
          onClick={() => setOpen(true)}
        >
          <KeyRoundIcon aria-hidden="true" />
          OAuth 2.0
        </Button>
      </div>
      {open ? (
        <McpOAuthDialog
          serverId={serverId}
          workspaceId={workspaceId}
          canEdit={canEdit}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
