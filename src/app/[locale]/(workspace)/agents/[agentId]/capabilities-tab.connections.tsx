"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ConnectionSelection } from "@/components/tools/connection-selection";
import type { ExecutionConnection } from "@/modules/tool-connections/connection-selection";

export function AssistantConnections({
  serverId,
  selectedIds,
  onChange,
}: {
  serverId: string;
  selectedIds?: string[] | null;
  onChange: (ids: string[] | null) => void;
}) {
  const { workspaceId } = useWorkspace();
  const t = useTranslations("connectionSelection");
  const [isServiceNow, setIsServiceNow] = useState(false);
  const [connections, setConnections] = useState<ExecutionConnection[] | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    fetchJson<{
      connectorKey: string | null;
      connections: ExecutionConnection[];
    }>(
      `/api/workspace/mcp-servers/${serverId}/tools?workspaceId=${workspaceId}&includeConnections=true`,
    )
      .then((data) => {
        if (active) {
          setConnections(data.connections);
          setIsServiceNow(data.connectorKey === "servicenow");
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, serverId, attempt]);
  if (error)
    return (
      <div role="alert" className="text-xs">
        {t("error")}{" "}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t("retry")}
        </Button>
      </div>
    );
  if (connections === null)
    return (
      <p className="text-xs text-muted-foreground" role="status">
        {t("loading")}
      </p>
    );
  if (!isServiceNow) return null;
  return (
    <ConnectionSelection
      connections={connections}
      selectedIds={selectedIds}
      onChange={onChange}
      allowDefault
    />
  );
}
