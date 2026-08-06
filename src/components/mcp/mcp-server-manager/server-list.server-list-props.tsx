"use client";

import { KeyRoundIcon,PlusIcon,SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type Dispatch,type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { ServerCardSkeleton } from "./mcp-shared";
import { EmptyServers,ServerItem } from "./server-list.empty-servers";
import type { McpServer,McpTool,ServerStatusFilter } from "./types";

export type ServerListProps = {
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
  onExpandedServersChangeAction: Dispatch<SetStateAction<Record<string, boolean>>>;
  onToolSearchChangeAction: Dispatch<SetStateAction<Record<string, string>>>;
  onEditServerAction: (server: McpServer) => void;
  onDeleteServerAction: (serverId: string) => void;
  onRetryDiscoveryAction: (serverId: string) => void;
  onShareServerAction: (server: McpServer) => void;
  onShareToolAction: (server: McpServer, tool: McpTool) => void;
  onToggleEnabledAction: (server: McpServer, enabled: boolean) => void;
  onToggleServerApprovalAction: (server: McpServer, requireApproval: boolean) => void;
  onToggleToolAction: (serverId: string, toolId: string, enabled: boolean) => void;
  onToggleToolActionApproval: (serverId: string, toolId: string, requireApproval: boolean) => void;
};

export function ServerList(props: ServerListProps) {
  return (
    <section className="space-y-3">
      <ServerListToolbar {...props} />
      <ServerListContent {...props} />
    </section>
  );
}

function ServerListToolbar({ servers, filteredServerCount, visibleCount, loading, canManageServers, search, filterStatus, onSearchChangeAction, onFilterChangeAction, onAddServerAction, onOpenConnectionsAction }: ServerListProps) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="rounded-2xl border border-border/65 bg-card/85 p-3 shadow-[var(--surface-shadow)]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label={t("filterServers")} placeholder={t("searchPlaceholder")} value={search} onChange={(event) => onSearchChangeAction(event.target.value)} className="h-10 pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={(value) => onFilterChangeAction(value as ServerStatusFilter)}>
          <SelectTrigger className="h-10 w-full lg:w-44" aria-label={t("filterStatus")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="enabled">{t("enabled")}</SelectItem>
            <SelectItem value="disabled">{t("disabled")}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" className="h-10 shrink-0" disabled={loading} onClick={onOpenConnectionsAction}>
          <KeyRoundIcon aria-hidden="true" />
          {t("connections")}
        </Button>
        <Button type="button" className="h-10 shrink-0" disabled={loading || !canManageServers} onClick={onAddServerAction}>
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
    return <div className="rounded-2xl border border-dashed border-border/70 px-5 py-8 text-center text-sm text-muted-foreground">{t("noMatch", { query: props.search })}</div>;
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
              count: Math.min(24, props.filteredServerCount - props.visibleCount),
            })}
          </Button>
        </div>
      ) : null}
    </>
  );
}
