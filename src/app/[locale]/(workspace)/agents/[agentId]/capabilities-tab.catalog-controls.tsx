import {
  BookMarkedIcon,
  BookOpenIcon,
  BoxesIcon,
  Grid2X2Icon,
  ListIcon,
  SearchIcon,
  ServerIcon,
  WrenchIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CapabilityFilter = "all" | "tools" | "mcp" | "knowledge" | "skills";
export type CapabilityDisplayMode = "grid" | "list";

const FILTER_ICONS = {
  all: BoxesIcon,
  tools: WrenchIcon,
  mcp: ServerIcon,
  knowledge: BookOpenIcon,
  skills: BookMarkedIcon,
} as const;

export function CapabilityCatalogControls({
  filter,
  setFilter,
  query,
  setQuery,
  displayMode,
  setDisplayMode,
  counts,
  labels,
  children,
}: {
  filter: CapabilityFilter;
  setFilter: (filter: CapabilityFilter) => void;
  query: string;
  setQuery: (query: string) => void;
  displayMode: CapabilityDisplayMode;
  setDisplayMode: (mode: CapabilityDisplayMode) => void;
  counts: Record<CapabilityFilter, number>;
  labels: Record<CapabilityFilter, string> & {
    search: string;
    grid: string;
    list: string;
  };
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/72 shadow-[var(--surface-shadow)]">
      <div className="grid lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside
          className="flex gap-1 overflow-x-auto border-b border-border/60 p-2.5 lg:min-h-full lg:flex-col lg:border-b-0 lg:border-r lg:p-3"
          aria-label={labels.all}
        >
          {(Object.keys(FILTER_ICONS) as CapabilityFilter[]).map((value) => {
            const Icon = FILTER_ICONS[value];
            return (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors lg:w-full",
                  filter === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{labels[value]}</span>
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    filter === value
                      ? "text-primary-foreground/75"
                      : "text-muted-foreground",
                  )}
                >
                  {counts[value]}
                </span>
              </button>
            );
          })}
        </aside>
        <div className="min-w-0 p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/45 p-1">
            <div className="relative min-w-0 flex-1">
              <SearchIcon
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.search}
                aria-label={labels.search}
                className="h-11 border-transparent bg-background/85 pl-9 shadow-none focus-visible:border-ring"
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-11 shrink-0 rounded-lg"
              aria-label={displayMode === "grid" ? labels.list : labels.grid}
              onClick={() =>
                setDisplayMode(displayMode === "grid" ? "list" : "grid")
              }
            >
              {displayMode === "grid" ? (
                <ListIcon className="size-4" aria-hidden="true" />
              ) : (
                <Grid2X2Icon className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <div className="mt-3 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
