"use client";

import { ChevronDownIcon } from "lucide-react";

import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible,CollapsibleContent,CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";

import { ToolRow } from "./capabilities-tab.builtin-tool-package";
import type { McpServer,McpTool,ToolBindingState } from "./types";
import { getMcpServerState,isMcpToolApprovalForced } from "./utils";

export function McpServerCollapsible({ server, mcpTools, mcpServers, mcpBindings, setMcpBindings, noMcpToolsSyncedLabel, disabledInMcpLabel, allToolsLabel, extraApprovalLabel, approvalLabel, partialLabel, mixedApprovalLabel, forcedLabel }: { server: McpServer; mcpTools: McpTool[]; mcpServers: McpServer[]; mcpBindings: ToolBindingState; setMcpBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void; noMcpToolsSyncedLabel: string; disabledInMcpLabel: string; allToolsLabel: string; extraApprovalLabel: string; approvalLabel: string; partialLabel: string; mixedApprovalLabel: string; forcedLabel: string }) {
  const serverState = getMcpServerState(server.id, mcpTools, mcpServers, mcpBindings);
  const serverTools = mcpTools.filter((tool) => tool.mcpServerId === server.id);

  function setServerToolsEnabled(enabled: boolean) {
    const serverTools = mcpTools.filter((t) => t.mcpServerId === server.id);
    setMcpBindings((current) => {
      const next = { ...current };
      for (const tool of serverTools) {
        const cb = current[tool.id];
        next[tool.id] = {
          enabled: enabled && tool.enabled,
          requireApproval: isMcpToolApprovalForced(tool, mcpServers) || (cb?.requireApproval ?? false),
        };
      }
      return next;
    });
  }

  function setServerApproval(shouldRequireApproval: boolean) {
    const bindableTools = mcpTools.filter((t) => t.mcpServerId === server.id && t.enabled).filter((t) => mcpBindings[t.id]?.enabled);
    setMcpBindings((current) => {
      const next = { ...current };
      for (const tool of bindableTools) {
        next[tool.id] = {
          enabled: true,
          requireApproval: isMcpToolApprovalForced(tool, mcpServers) || shouldRequireApproval,
        };
      }
      return next;
    });
  }

  function setToolEnabled(tool: McpTool, enabled: boolean) {
    setMcpBindings((current) => ({
      ...current,
      [tool.id]: {
        enabled: enabled && tool.enabled,
        requireApproval: isMcpToolApprovalForced(tool, mcpServers) || (current[tool.id]?.requireApproval ?? false),
      },
    }));
  }

  function setToolApproval(tool: McpTool, shouldRequireApproval: boolean) {
    setMcpBindings((current) => ({
      ...current,
      [tool.id]: {
        enabled: current[tool.id]?.enabled ?? false,
        requireApproval: tool.enabled ? isMcpToolApprovalForced(tool, mcpServers) || shouldRequireApproval : false,
      },
    }));
  }

  return (
    <Collapsible defaultOpen={false} className="rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/35 hover:bg-muted/40">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 gap-2">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="shrink-0">
              <ChevronDownIcon className="transition-transform data-[state=open]:rotate-180" aria-hidden="true" />
            </Button>
          </CollapsibleTrigger>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{server.name}</p>
              <ResourceProvenanceBadge provenance={server.provenance} />
              <Badge variant="secondary">
                {serverState.selectedCount}/{serverState.bindableTools.length}
              </Badge>
              {serverState.someSelected && <Badge variant="outline">{partialLabel}</Badge>}
              {serverState.someApproval && <Badge variant="outline">{mixedApprovalLabel}</Badge>}
              {serverState.forcedApprovalCount > 0 && (
                <Badge variant="secondary">
                  {serverState.forcedApprovalCount} {forcedLabel}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {serverTools.length} {serverTools.length === 1 ? "tool" : "tools"} · {serverState.selectedCount} enabled
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <label className="flex items-center gap-2">
            {allToolsLabel}
            <Switch aria-label={allToolsLabel} checked={serverState.allSelected} disabled={serverState.bindableTools.length === 0} onCheckedChange={setServerToolsEnabled} />
          </label>
          <label className="flex items-center gap-2">
            {extraApprovalLabel}
            <Switch aria-label={extraApprovalLabel} checked={serverState.allApproval} disabled={serverState.selectedCount === 0 || serverState.selectedCount === serverState.forcedApprovalCount} onCheckedChange={setServerApproval} />
          </label>
        </div>
      </div>
      <CollapsibleContent className="flex flex-col gap-2 pt-3">
        {serverTools.length === 0 ? (
          <p className="text-xs text-muted-foreground">{noMcpToolsSyncedLabel}</p>
        ) : (
          serverTools.map((tool) => {
            const binding = mcpBindings[tool.id];
            const toolEnabled = tool.enabled && Boolean(binding?.enabled);
            const approvalForced = isMcpToolApprovalForced(tool, mcpServers);
            return <ToolRow key={tool.id} name={tool.name} description={tool.enabled ? (tool.description ?? undefined) : disabledInMcpLabel} enabled={toolEnabled} onEnabledChange={(enabled) => setToolEnabled(tool, enabled)} requireApproval={toolEnabled && (approvalForced || Boolean(binding?.requireApproval))} approvalDisabled={!toolEnabled || approvalForced} onApprovalChange={(checked) => setToolApproval(tool, checked)} approvalLabel={approvalLabel} />;
          })
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
