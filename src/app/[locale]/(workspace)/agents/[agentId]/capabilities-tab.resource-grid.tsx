import type { LucideIcon } from "lucide-react";

import { ResourceProvenanceBadge, type ResourceProvenance } from "@/components/resource-provenance-badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type CapabilityResource = { id: string; name: string; description?: string | null; provenance?: ResourceProvenance };

export function CapabilityResourceGrid({ resources, selectedIds, setSelectedIds, icon: Icon, displayMode, toggleLabel }: {
  resources: CapabilityResource[];
  selectedIds: string[];
  setSelectedIds: (update: (current: string[]) => string[]) => void;
  icon: LucideIcon;
  displayMode: "grid" | "list";
  toggleLabel: (name: string) => string;
}) {
  return (
    <div className={cn("grid gap-2", displayMode === "grid" && "sm:grid-cols-2")}>
      {resources.map((resource) => {
        const selected = selectedIds.includes(resource.id);
        return (
          <label key={resource.id} className={cn("ui-list-row flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl border p-4 transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/25 hover:bg-card/65 hover:shadow-[var(--surface-shadow-hover)]", selected ? "border-primary/30 bg-primary/5" : "border-border/60")}>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><Icon className="size-4" aria-hidden="true" /></span>
                <span className="truncate" title={resource.name}>{resource.name}</span>
                {resource.provenance ? <ResourceProvenanceBadge provenance={resource.provenance} /> : null}
              </span>
              {resource.description ? <span className="mt-1 line-clamp-2 block pl-10 text-xs leading-5 text-muted-foreground">{resource.description}</span> : null}
            </span>
            <Switch className="shrink-0" aria-label={toggleLabel(resource.name)} checked={selected} onCheckedChange={(checked) => setSelectedIds((current) => checked ? [...new Set([...current, resource.id])] : current.filter((id) => id !== resource.id))} />
          </label>
        );
      })}
    </div>
  );
}
