"use client";

import { type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDownIcon,
  MoreHorizontal,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  Share2,
  ShieldAlert,
  Trash2Icon,
  Wrench,
  XIcon,
  ZapIcon,
  PlusIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  toolsByServer: Record<string, McpTool[]>;
  loading: boolean;
  search: string;
  filterStatus: ServerStatusFilter;
  expandedServers: Record<string, boolean>;
  toolSearch: Record<string, string>;
  onSearchChangeAction: (value: string) => void;
  onFilterChangeAction: (value: ServerStatusFilter) => void;
  onAddServerAction: () => void;
  onExpandedServersChangeAction: Dispatch<
    SetStateAction<Record<string, boolean>>
  >;
  onToolSearchChangeAction: Dispatch<SetStateAction<Record<string, string>>>;
  onEditServerAction: (server: McpServer) => void;
  onDeleteServerAction: (serverId: string) => void;
  onTestServerAction: (serverId: string) => void;
  onSyncServerAction: (serverId: string) => void;
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
    <section className="rounded-xl border bg-card">
      <ServerListToolbar {...props} />
      <ServerListContent {...props} />
    </section>
  );
}

function ServerListToolbar({
  servers,
  search,
  filterStatus,
  onSearchChangeAction,
  onFilterChangeAction,
}: ServerListProps) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-base font-semibold">{t("servers")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("serverCount", { count: servers.length })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {servers.length > 2 ? (
          <div className="relative w-48 sm:w-56">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("filterServers")}
              placeholder={t("filterPlaceholder")}
              value={search}
              onChange={(e) => onSearchChangeAction(e.target.value)}
              className="h-8 pl-9 text-sm"
            />
            {search ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
                onClick={() => onSearchChangeAction("")}
                aria-label={t("clearSearch")}
              >
                <XIcon className="size-3" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : null}
        <Select
          value={filterStatus}
          onValueChange={(v) => onFilterChangeAction(v as ServerStatusFilter)}
        >
          <SelectTrigger className="w-32" aria-label={t("filterStatus")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="enabled">{t("enabled")}</SelectItem>
            <SelectItem value="disabled">{t("disabled")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ServerListContent(props: ServerListProps) {
  const t = useTranslations("mcp.serverManager");
  if (props.loading) {
    return (
      <div className="space-y-1 p-2">
        <ServerCardSkeleton />
        <ServerCardSkeleton />
      </div>
    );
  }

  if (props.filteredServers.length === 0 && props.servers.length === 0) {
    return (
      <EmptyServers
        canManageServers={props.canManageServers}
        onAddServerAction={props.onAddServerAction}
      />
    );
  }

  if (props.filteredServers.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
        {t("noMatch", { query: props.search })}
      </div>
    );
  }

  return (
    <div className="divide-y">
      {props.filteredServers.map((server) => (
        <ServerItem key={server.id} server={server} {...props} />
      ))}
    </div>
  );
}

function EmptyServers({
  canManageServers,
  onAddServerAction,
}: {
  canManageServers: boolean;
  onAddServerAction: () => void;
}) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-medium">{t("emptyTitle")}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {t("emptyDescription")}
      </p>
      {canManageServers ? (
        <Button size="sm" className="mt-4" onClick={onAddServerAction}>
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("emptyAction")}
        </Button>
      ) : null}
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
  onTestServerAction,
  onSyncServerAction,
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
        onTestServerAction={onTestServerAction}
        onSyncServerAction={onSyncServerAction}
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
      <Badge
        variant={server.isGlobal ? "secondary" : "outline"}
        className="hidden lg:inline-flex"
      >
        {server.isGlobal ? t("organization") : t("private")}
      </Badge>
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
  onTestServerAction,
  onSyncServerAction,
  onShareServerAction,
}: Pick<
  ServerListProps,
  | "onEditServerAction"
  | "onDeleteServerAction"
  | "onTestServerAction"
  | "onSyncServerAction"
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
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("serverActions")}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!server.canEdit}
          onClick={() => onTestServerAction(server.id)}
        >
          <ZapIcon className="size-4" />
          {t("testConnection")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!server.canEdit}
          onClick={() => onSyncServerAction(server.id)}
        >
          <RefreshCwIcon className="size-4" />
          {t("syncTools")}
        </DropdownMenuItem>
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
}: ServerListProps & {
  server: McpServer;
  tools: McpTool[];
  filteredTools: McpTool[];
  serverToolSearch: string;
}) {
  const t = useTranslations("mcp.serverManager");
  return (
    <CollapsibleContent>
      <div className="border-t border-border/60">
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
              {tools.length === 0 ? t("noTools") : t("noToolMatch")}
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
