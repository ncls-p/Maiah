"use client";

import {
  CircleAlertIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ServerListProps } from "./server-list.server-list-props";
import { ToolRow } from "./server-list.tool-row";
import type { McpServer, McpTool } from "./types";

export function ToolsPanel({
  server,
  tools,
  filteredTools,
  serverToolSearch,
  onToolSearchChangeAction,
  onToggleToolAction,
  onToggleToolActionApproval,
  onShareToolAction,
  onRetryDiscoveryAction,
}: ServerListProps & {
  server: McpServer;
  tools: McpTool[];
  filteredTools: McpTool[];
  serverToolSearch: string;
}) {
  const t = useTranslations("mcp.serverManager");
  const discoveryFailed = server.healthStatus === "unhealthy";
  return (
    <CollapsibleContent>
      <div className="border-t border-border/60">
        {discoveryFailed ? (
          <div
            className="flex flex-col gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <div className="flex items-center gap-2 text-sm">
              <CircleAlertIcon
                className="size-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <span>{t("discoveryFailedDescription")}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!server.canEdit}
              onClick={() => onRetryDiscoveryAction(server.id)}
            >
              <RefreshCwIcon className="size-4" aria-hidden="true" />
              {t("retryDiscovery")}
            </Button>
          </div>
        ) : null}
        {tools.length > 3 ? (
          <ToolSearch
            serverId={server.id}
            value={serverToolSearch}
            onToolSearchChangeAction={onToolSearchChangeAction}
          />
        ) : null}
        <div className="max-h-96 overflow-y-auto">
          {filteredTools.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {tools.length === 0
                ? discoveryFailed
                  ? t("noToolsAfterFailure")
                  : t("noTools")
                : t("noToolMatch")}
            </div>
          ) : (
            <div className="divide-y divide-border/30 px-4 py-2">
              {filteredTools.map((tool) => (
                <ToolRow
                  key={tool.id}
                  server={server}
                  tool={tool}
                  onToggleToolAction={onToggleToolAction}
                  onToggleToolActionApproval={onToggleToolActionApproval}
                  onShareToolAction={onShareToolAction}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </CollapsibleContent>
  );
}

function ToolSearch({
  serverId,
  value,
  onToolSearchChangeAction,
}: {
  serverId: string;
  value: string;
  onToolSearchChangeAction: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
      <SearchIcon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        aria-label={t("searchTools")}
        placeholder={t("searchToolsPlaceholder")}
        value={value}
        onChange={(e) =>
          onToolSearchChangeAction((prev) => ({
            ...prev,
            [serverId]: e.target.value,
          }))
        }
        className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />
      {value ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label={t("clearToolSearch")}
          onClick={() =>
            onToolSearchChangeAction((prev) => ({ ...prev, [serverId]: "" }))
          }
        >
          <XIcon className="size-3" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
