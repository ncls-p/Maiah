"use client";

import {
MoreHorizontalIcon,
ShieldCheckIcon,
WrenchIcon
} from "lucide-react";
import {
useState
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BuiltInToolPolicy,RiskBadge,TOOL_ICONS } from "./builtin-tools-panel.built-in-tool-policy";


export function BuiltinToolCard({
  tool,
  riskLabel,
  approvalLabel,
  enabledLabel,
  disabledLabel,
  detailsLabel,
  canManage,
  pending,
  onEnabledChange,
  onApprovalChange,
  categoryLabel,
}: {
  tool: BuiltInToolPolicy;
  riskLabel: string;
  approvalLabel: string;
  enabledLabel: string;
  disabledLabel: string;
  detailsLabel: string;
  canManage: boolean;
  pending: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onApprovalChange: (requireApproval: boolean) => void;
  categoryLabel: string;
}) {
  const ToolIcon = TOOL_ICONS[tool.name] ?? WrenchIcon;
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-2xl border border-border/70 bg-card/72 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-card",
        !tool.enabled && "bg-muted/18",
      )}
    >
      <div className="flex min-h-[4.5rem] items-center gap-3 p-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <ToolIcon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold tracking-[-0.015em] text-foreground">
            {tool.displayName}
          </h4>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {tool.description}
          </p>
        </div>
        <Switch
          checked={tool.enabled}
          disabled={!canManage || pending}
          onCheckedChange={onEnabledChange}
          aria-label={`${enabledLabel} — ${tool.displayName}`}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="rounded-lg text-muted-foreground"
          aria-label={detailsLabel}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <MoreHorizontalIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {expanded ? (
        <div className="grid gap-3 border-t border-border/60 bg-muted/18 px-3 py-3 animate-in-fade sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {categoryLabel}
              </span>
              <RiskBadge riskLevel={tool.riskLevel} label={riskLabel} />
              <Badge
                variant={tool.enabled ? "secondary" : "outline"}
                className="rounded-full text-[0.62rem]"
              >
                {tool.enabled ? enabledLabel : disabledLabel}
              </Badge>
            </div>
            <code className="mt-2 block truncate text-[0.68rem] text-muted-foreground">
              {tool.name}
            </code>
          </div>
          <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <ShieldCheckIcon
                className="size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              {approvalLabel}
            </span>
            <Switch
              checked={tool.requireApproval}
              disabled={!canManage || pending}
              onCheckedChange={onApprovalChange}
              aria-label={`${approvalLabel} — ${tool.displayName}`}
            />
          </label>
        </div>
      ) : null}
    </article>
  );
}
