"use client";

import {
ChevronDownIcon,
ShieldAlert
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { Badge } from "@/components/ui/badge";
import {
Collapsible,
CollapsibleTrigger
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { TransportTypeIcon } from "./mcp-shared";
import { DesktopServerToggles,MobileServerToggles,ServerActions } from "./server-list.desktop-server-toggles";
import { ServerListProps } from "./server-list.server-list-props";
import { ToolsPanel } from "./server-list.tools-panel";
import {
getHealthColor,
healthDotClass,
serverEndpointLabel,
transportAccent,
transportLabel,
} from "./transport";
import type { McpServer,McpTool } from "./types";


export function EmptyServers() {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="rounded-2xl border border-dashed border-border/70 px-5 py-12 text-center">
      <p className="text-sm font-medium">{t("emptyTitle")}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {t("emptyDescription")}
      </p>
    </div>
  );
}

export function ServerItem({
  server,
  ...props
}: ServerListProps & { server: McpServer }) {
  const tools = props.toolsByServer[server.id] ?? [];
  const isExpanded = props.expandedServers[server.id] ?? false;
  const serverToolSearch = props.toolSearch[server.id] ?? "";
  const filteredTools = serverToolSearch
    ? tools.filter(
        (t) =>
          t.name.toLowerCase().includes(serverToolSearch.toLowerCase()) ||
          (t.description ?? "")
            .toLowerCase()
            .includes(serverToolSearch.toLowerCase()),
      )
    : tools;

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={(open) =>
        props.onExpandedServersChangeAction((current) => ({
          ...current,
          [server.id]: open,
        }))
      }
    >
      <div
        className={cn(
          "group transition-colors",
          !server.enabled && "opacity-60",
        )}
      >
        <ServerHeader
          server={server}
          tools={tools}
          isExpanded={isExpanded}
          {...props}
        />
        <MobileServerToggles server={server} {...props} />
        <ToolsPanel
          server={server}
          tools={tools}
          filteredTools={filteredTools}
          serverToolSearch={serverToolSearch}
          {...props}
        />
      </div>
    </Collapsible>
  );
}

function ServerHeader({
  server,
  tools,
  isExpanded,
  onEditServerAction,
  onDeleteServerAction,
  onRetryDiscoveryAction,
  onShareServerAction,
  onToggleEnabledAction,
  onToggleServerApprovalAction,
}: ServerListProps & {
  server: McpServer;
  tools: McpTool[];
  isExpanded: boolean;
}) {
  const colors = transportAccent(server.transport);

  return (
    <div className="flex items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/40">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div
            className={cn(
              "hidden h-8 w-1 shrink-0 rounded-full sm:block",
              colors.bar,
            )}
          />
          <TransportTypeIcon transport={server.transport} />
          <ServerSummary server={server} tools={tools} />
          <ServerBadges server={server} />
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <DesktopServerToggles
        server={server}
        onToggleEnabledAction={onToggleEnabledAction}
        onToggleServerApprovalAction={onToggleServerApprovalAction}
      />
      <ServerActions
        server={server}
        onEditServerAction={onEditServerAction}
        onDeleteServerAction={onDeleteServerAction}
        onRetryDiscoveryAction={onRetryDiscoveryAction}
        onShareServerAction={onShareServerAction}
      />
    </div>
  );
}

function ServerSummary({
  server,
  tools,
}: {
  server: McpServer;
  tools: McpTool[];
}) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium">{server.name}</p>
        <ResourceProvenanceBadge provenance={server.provenance} />
        <Badge
          variant="outline"
          className={cn(
            "font-normal",
            server.enabled ? "text-success" : "text-muted-foreground",
          )}
        >
          <span
            className={healthDotClass(getHealthColor(server.healthStatus))}
          />
          {transportLabel(server.transport)}
        </Badge>
        {tools.length > 0 ? (
          <Badge variant="secondary">
            {t("toolCount", { count: tools.length })}
          </Badge>
        ) : null}
      </div>
      <p className="truncate font-mono text-xs text-muted-foreground">
        {serverEndpointLabel(server)}
      </p>
    </div>
  );
}

function ServerBadges({ server }: { server: McpServer }) {
  const t = useTranslations("mcp.serverManager");
  return (
    <>
      {server.requireApproval ? (
        <Badge variant="secondary" className="hidden lg:inline-flex">
          <ShieldAlert className="size-3" aria-hidden="true" />
          {t("approval")}
        </Badge>
      ) : null}
      {server.hasHeaders ? (
        <Badge variant="secondary" className="hidden lg:inline-flex">
          {t("apiKey")}
        </Badge>
      ) : null}
    </>
  );
}
