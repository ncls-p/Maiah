import { CheckCircle2Icon, type LucideIcon } from "lucide-react";

import {
  ResourceProvenanceBadge,
  type ResourceProvenance,
} from "@/components/resource-provenance-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type CapabilityResource = {
  id: string;
  name: string;
  description?: string | null;
  provenance?: ResourceProvenance;
};

export function CapabilityResourceGrid({
  resources,
  selectedIds,
  setSelectedIds,
  icon: Icon,
  displayMode,
  toggleLabel,
  labels,
}: {
  resources: CapabilityResource[];
  selectedIds: string[];
  setSelectedIds: (update: (current: string[]) => string[]) => void;
  icon: LucideIcon;
  displayMode: "grid" | "list";
  toggleLabel: (name: string) => string;
  labels: {
    active: string;
    selected: string;
    enableAll: string;
    disableAll: string;
  };
}) {
  const visibleIds = resources.map((resource) => resource.id);
  const selectedVisible = visibleIds.filter((id) => selectedIds.includes(id));
  const updateVisible = (enabled: boolean) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => (enabled ? next.add(id) : next.delete(id)));
      return [...next];
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/55 bg-muted/30 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {labels.selected}
        </span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2.5 text-xs"
            disabled={selectedVisible.length === visibleIds.length}
            onClick={() => updateVisible(true)}
          >
            {labels.enableAll}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2.5 text-xs"
            disabled={selectedVisible.length === 0}
            onClick={() => updateVisible(false)}
          >
            {labels.disableAll}
          </Button>
        </span>
      </div>
      <div
        className={cn("grid gap-2", displayMode === "grid" && "sm:grid-cols-2")}
      >
        {resources.map((resource) => {
          const selected = selectedIds.includes(resource.id);
          return (
            <div
              key={resource.id}
              data-state={selected ? "active" : "inactive"}
              className={cn(
                "ui-list-row flex min-w-0 items-center justify-between gap-3 rounded-xl border p-3.5 transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/25 hover:bg-card/65",
                selected
                  ? "border-primary/35 bg-primary/[0.07] shadow-[inset_3px_0_0_hsl(var(--primary))]"
                  : "border-border/60 bg-background/40",
              )}
            >
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      selected
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="line-clamp-2" title={resource.name}>
                    {resource.name}
                  </span>
                  {resource.provenance ? (
                    <ResourceProvenanceBadge provenance={resource.provenance} />
                  ) : null}
                  {selected ? (
                    <Badge
                      variant="outline"
                      className="hidden border-primary/25 bg-primary/8 text-primary sm:inline-flex"
                    >
                      <CheckCircle2Icon aria-hidden="true" />
                      {labels.active}
                    </Badge>
                  ) : null}
                </span>
                {resource.description ? (
                  <span className="mt-1 line-clamp-2 block pl-10 text-xs leading-5 text-muted-foreground">
                    {resource.description}
                  </span>
                ) : null}
              </span>
              <Switch
                className="shrink-0"
                aria-label={toggleLabel(resource.name)}
                checked={selected}
                onCheckedChange={(checked) =>
                  setSelectedIds((current) =>
                    checked
                      ? [...new Set([...current, resource.id])]
                      : current.filter((id) => id !== resource.id),
                  )
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
