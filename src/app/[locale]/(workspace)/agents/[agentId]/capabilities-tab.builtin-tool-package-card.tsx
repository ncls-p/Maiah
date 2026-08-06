"use client";

import { ChevronDownIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible,CollapsibleContent,CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { BuiltinToolPackage,ToolRow } from "./capabilities-tab.builtin-tool-package";
import type { BuiltinTool,ToolBindingState } from "./types";

export function BuiltinToolPackageCard({ toolPackage, bindings, packageLabel, description, countLabel, allToolsLabel, extraApprovalLabel, detailsLabel, partialLabel, mixedApprovalLabel, approvalLabel, canConfigureApproval, setBindings }: { toolPackage: BuiltinToolPackage; bindings: ToolBindingState; packageLabel: string; description: string; countLabel: string; allToolsLabel: string; extraApprovalLabel: string; detailsLabel: string; partialLabel: string; mixedApprovalLabel: string; approvalLabel: string; canConfigureApproval: boolean; setBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void }) {
  const PackageIcon = toolPackage.icon;
  const selectedCount = toolPackage.tools.filter((tool) => bindings[tool.id]?.enabled).length;
  const allSelected = toolPackage.tools.length > 0 && selectedCount === toolPackage.tools.length;
  const partiallySelected = selectedCount > 0 && selectedCount < toolPackage.tools.length;
  const selectedTools = toolPackage.tools.filter((tool) => bindings[tool.id]?.enabled);
  const approvalCount = selectedTools.filter((tool) => bindings[tool.id]?.requireApproval).length;
  const allSelectedRequireApproval = selectedTools.length > 0 && approvalCount === selectedTools.length;
  const someSelectedRequireApproval = approvalCount > 0;

  function setPackageEnabled(enabled: boolean) {
    setBindings((current) => {
      const next = { ...current };
      for (const tool of toolPackage.tools) {
        next[tool.id] = {
          enabled,
          requireApproval: current[tool.id]?.requireApproval ?? false,
        };
      }
      return next;
    });
  }

  function setPackageApproval(shouldRequireApproval: boolean) {
    setBindings((current) => {
      const next = { ...current };
      for (const tool of toolPackage.tools) {
        if (!current[tool.id]?.enabled) continue;
        next[tool.id] = {
          enabled: true,
          requireApproval: shouldRequireApproval,
        };
      }
      return next;
    });
  }

  function setToolEnabled(tool: BuiltinTool, enabled: boolean) {
    setBindings((current) => ({
      ...current,
      [tool.id]: {
        enabled,
        requireApproval: current[tool.id]?.requireApproval ?? false,
      },
    }));
  }

  function setToolApproval(tool: BuiltinTool, shouldRequireApproval: boolean) {
    setBindings((current) => ({
      ...current,
      [tool.id]: {
        enabled: current[tool.id]?.enabled ?? false,
        requireApproval: shouldRequireApproval,
      },
    }));
  }

  return (
    <Collapsible defaultOpen={partiallySelected} className={cn("rounded-xl border bg-background p-3 transition-colors hover:border-primary/35 hover:bg-muted/40", selectedCount > 0 ? "border-primary/25" : "border-border")}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border", selectedCount > 0 ? "border-primary/20 bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            <PackageIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{packageLabel}</p>
              <Badge variant="secondary">{countLabel}</Badge>
              {partiallySelected ? <Badge variant="outline">{partialLabel}</Badge> : null}
              {someSelectedRequireApproval ? <Badge variant="outline">{allSelectedRequireApproval ? approvalLabel : mixedApprovalLabel}</Badge> : null}
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            {allToolsLabel}
            <Switch aria-label={allToolsLabel} checked={allSelected} disabled={toolPackage.tools.length === 0} onCheckedChange={setPackageEnabled} />
          </label>
          {canConfigureApproval ? (
            <label className="flex items-center gap-2">
              {extraApprovalLabel}
              <Switch aria-label={extraApprovalLabel} checked={allSelectedRequireApproval} disabled={selectedCount === 0} onCheckedChange={setPackageApproval} />
            </label>
          ) : null}
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
              <ChevronDownIcon className="size-4" aria-hidden="true" />
              {detailsLabel}
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent className="flex flex-col gap-2 pt-3">
        {toolPackage.tools.map((tool) => (
          <ToolRow key={tool.id} name={tool.displayName || tool.name} description={tool.description} enabled={bindings[tool.id]?.enabled ?? false} onEnabledChange={(enabled) => setToolEnabled(tool, enabled)} requireApproval={bindings[tool.id]?.requireApproval ?? false} approvalDisabled={!bindings[tool.id]?.enabled} onApprovalChange={canConfigureApproval ? (checked) => setToolApproval(tool, checked) : undefined} approvalLabel={approvalLabel} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
