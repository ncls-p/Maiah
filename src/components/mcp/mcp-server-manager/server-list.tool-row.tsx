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
import { ServerListProps } from "./server-list.server-list-props";
import { LabeledSwitch } from "./server-list.desktop-server-toggles";


export function ToolRow({
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
