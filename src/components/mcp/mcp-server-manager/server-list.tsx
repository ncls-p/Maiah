"use client";

import { type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDownIcon,
  CircleAlertIcon,
  KeyRoundIcon,
  MoreHorizontal,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  Share2,
  ShieldAlert,
  Trash2Icon,
  Wrench,
  XIcon,
  PlusIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ServerCardSkeleton, TransportTypeIcon } from "./mcp-shared";
import {
  getHealthColor,
  healthDotClass,
  serverEndpointLabel,
  transportAccent,
  transportLabel,
} from "./transport";
import type { McpServer, McpTool, ServerStatusFilter } from "./types";

type ServerListProps = {
  canManageServers: boolean;
  servers: McpServer[];
  filteredServers: McpServer[];
  filteredServerCount: number;
  visibleCount: number;
  toolsByServer: Record<string, McpTool[]>;
  loading: boolean;
  search: string;
  filterStatus: ServerStatusFilter;
  expandedServers: Record<string, boolean>;
  toolSearch: Record<string, string>;
  onSearchChangeAction: (value: string) => void;
  onFilterChangeAction: (value: ServerStatusFilter) => void;
  onAddServerAction: () => void;
  onOpenConnectionsAction: () => void;
  onShowMoreAction: () => void;
  onExpandedServersChangeAction: Dispatch<
    SetStateAction<Record<string, boolean>>
  >;
  onToolSearchChangeAction: Dispatch<SetStateAction<Record<string, string>>>;
  onEditServerAction: (server: McpServer) => void;
  onDeleteServerAction: (serverId: string) => void;
  onRetryDiscoveryAction: (serverId: string) => void;
  onShareServerAction: (server: McpServer) => void;
  onShareToolAction: (server: McpServer, tool: McpTool) => void;
  onToggleEnabledAction: (server: McpServer, enabled: boolean) => void;
  onToggleServerApprovalAction: (
    server: McpServer,
    requireApproval: boolean,
  ) => void;
  onToggleToolAction: (
    serverId: string,
    toolId: string,
    enabled: boolean,
  ) => void;
  onToggleToolActionApproval: (
    serverId: string,
    toolId: string,
    requireApproval: boolean,
  ) => void;
};

export function ServerList(props: ServerListProps) {
  return (
    <section className="space-y-3">
      <ServerListToolbar {...props} />
      <ServerListContent {...props} />
    </section>
  );
}

function ServerListToolbar({
  servers,
  filteredServerCount,
  visibleCount,
  loading,
  canManageServers,
  search,
  filterStatus,
  onSearchChangeAction,
  onFilterChangeAction,
  onAddServerAction,
  onOpenConnectionsAction,
}: ServerListProps) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="rounded-2xl border border-border/65 bg-card/85 p-3 shadow-[var(--surface-shadow)]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={t("filterServers")}
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(event) => onSearchChangeAction(event.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <Select
          value={filterStatus}
          onValueChange={(value) =>
            onFilterChangeAction(value as ServerStatusFilter)
          }
        >
          <SelectTrigger
            className="h-10 w-full lg:w-44"
            aria-label={t("filterStatus")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="enabled">{t("enabled")}</SelectItem>
            <SelectItem value="disabled">{t("disabled")}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0"
          disabled={loading}
          onClick={onOpenConnectionsAction}
        >
          <KeyRoundIcon aria-hidden="true" />
          {t("connections")}
        </Button>
        <Button
          type="button"
          className="h-10 shrink-0"
          disabled={loading || !canManageServers}
          onClick={onAddServerAction}
        >
          <PlusIcon aria-hidden="true" />
          {t("add")}
        </Button>
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground" aria-live="polite">
        {t("resultsCount", {
          visible: Math.min(visibleCount, filteredServerCount),
          total: filteredServerCount,
          configured: servers.length,
        })}
      </p>
    </div>
  );
}

function ServerListContent(props: ServerListProps) {
  const t = useTranslations("mcp.serverManager");
  if (props.loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border/65 bg-card">
        <ServerCardSkeleton />
        <ServerCardSkeleton />
        <ServerCardSkeleton />
      </div>
    );
  }

  if (props.filteredServers.length === 0 && props.servers.length === 0) {
    return <EmptyServers />;
  }

  if (props.filteredServers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 px-5 py-8 text-center text-sm text-muted-foreground">
        {t("noMatch", { query: props.search })}
      </div>
    );
  }

  return (
    <>
      <div className="divide-y overflow-hidden rounded-2xl border border-border/65 bg-card/85 shadow-[var(--surface-shadow)]">
        {props.filteredServers.map((server) => (
          <ServerItem key={server.id} server={server} {...props} />
        ))}
      </div>
      {props.visibleCount < props.filteredServerCount ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={props.onShowMoreAction}>
            {t("showMore", {
              count: Math.min(
                24,
                props.filteredServerCount - props.visibleCount,
              ),
            })}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function EmptyServers() {
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

function ServerItem({
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

function DesktopServerToggles({
  server,
  onToggleEnabledAction,
  onToggleServerApprovalAction,
}: Pick<
  ServerListProps,
  "onToggleEnabledAction" | "onToggleServerApprovalAction"
> & {
  server: McpServer;
}) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div
      className="hidden items-center gap-3 sm:flex"
      onClick={(e) => e.stopPropagation()}
    >
      <LabeledSwitch
        label={t("enabled")}
        ariaLabel={t("enableNamed", { name: server.name })}
        checked={server.enabled}
        disabled={!server.canEdit}
        onCheckedChange={(checked) => onToggleEnabledAction(server, checked)}
      />
      <LabeledSwitch
        label={t("approval")}
        ariaLabel={t("approvalNamed", { name: server.name })}
        checked={server.requireApproval}
        disabled={!server.canEdit}
        onCheckedChange={(checked) =>
          onToggleServerApprovalAction(server, checked)
        }
      />
    </div>
  );
}

function MobileServerToggles({
  server,
  onToggleEnabledAction,
  onToggleServerApprovalAction,
}: ServerListProps & { server: McpServer }) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="flex items-center gap-4 border-t border-border/30 px-4 pt-2 pb-1 sm:hidden">
      <LabeledSwitch
        label={t("enabled")}
        ariaLabel={t("enableNamed", { name: server.name })}
        checked={server.enabled}
        disabled={!server.canEdit}
        onCheckedChange={(checked) => onToggleEnabledAction(server, checked)}
      />
      <LabeledSwitch
        label={t("approval")}
        ariaLabel={t("approvalNamed", { name: server.name })}
        checked={server.requireApproval}
        disabled={!server.canEdit}
        onCheckedChange={(checked) =>
          onToggleServerApprovalAction(server, checked)
        }
      />
      {server.requireApproval ? (
        <Badge variant="secondary">
          <ShieldAlert className="size-3" aria-hidden="true" />
          {t("approval")}
        </Badge>
      ) : null}
      {server.hasHeaders ? (
        <Badge variant="secondary">{t("apiKey")}</Badge>
      ) : null}
    </div>
  );
}

function LabeledSwitch({
  label,
  ariaLabel,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function ServerActions({
  server,
  onEditServerAction,
  onDeleteServerAction,
  onRetryDiscoveryAction,
  onShareServerAction,
}: Pick<
  ServerListProps,
  | "onEditServerAction"
  | "onDeleteServerAction"
  | "onRetryDiscoveryAction"
  | "onShareServerAction"
> & { server: McpServer }) {
  const tShare = useTranslations("marketplace.share");
  const t = useTranslations("mcp.serverManager");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("serverActions")}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {server.healthStatus === "unhealthy" ? (
          <DropdownMenuItem
            disabled={!server.canEdit}
            onClick={() => onRetryDiscoveryAction(server.id)}
          >
            <RefreshCwIcon className="size-4" />
            {t("retryDiscovery")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={!server.canEdit}
          onClick={() => onShareServerAction(server)}
        >
          <Share2 className="size-4" />
          {tShare("action")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!server.canEdit}
          onClick={() => onEditServerAction(server)}
        >
          <PencilIcon className="size-4" />
          {t("editServer")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!server.canEdit}
          variant="destructive"
          onClick={() => onDeleteServerAction(server.id)}
        >
          <Trash2Icon className="size-4" />
          {t("removeServer")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ToolsPanel({
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

function ToolRow({
  server,
  tool,
  onToggleToolAction,
  onToggleToolActionApproval,
  onShareToolAction,
}: Pick<
  ServerListProps,
  "onToggleToolAction" | "onToggleToolActionApproval" | "onShareToolAction"
> & {
  server: McpServer;
  tool: McpTool;
}) {
  const tShare = useTranslations("marketplace.share");
  const t = useTranslations("mcp.serverManager");
  const isApprovalForced = server.requireApproval || tool.requireApproval;

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2.5 transition-opacity",
        !tool.enabled && "opacity-50",
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          tool.enabled
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Wrench className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">{tool.name}</span>
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              tool.enabled ? "bg-success" : "bg-muted-foreground",
            )}
          />
        </div>
        {tool.description ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {tool.description}
          </p>
        ) : null}
      </div>
      {isApprovalForced ? (
        <Badge
          variant="secondary"
          className="hidden items-center gap-1 sm:flex"
        >
          <ShieldAlert className="size-3" aria-hidden="true" />
          {server.requireApproval ? t("forced") : t("approval")}
        </Badge>
      ) : null}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label={`${tShare("action")} ${tool.name}`}
          disabled={!server.canEdit}
          onClick={() => onShareToolAction(server, tool)}
        >
          <Share2 className="size-3.5" aria-hidden="true" />
        </Button>
        <LabeledSwitch
          label={t("approval")}
          ariaLabel={t("approvalNamed", { name: tool.name })}
          checked={isApprovalForced}
          disabled={!server.canEdit || server.requireApproval}
          onCheckedChange={(checked) =>
            onToggleToolActionApproval(server.id, tool.id, checked)
          }
        />
        <LabeledSwitch
          label={t("enabled")}
          ariaLabel={t("enableNamed", { name: tool.name })}
          checked={tool.enabled}
          disabled={!server.canEdit}
          onCheckedChange={(checked) =>
            onToggleToolAction(server.id, tool.id, checked)
          }
        />
      </div>
    </div>
  );
}
