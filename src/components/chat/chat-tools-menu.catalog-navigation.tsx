import { SearchIcon, Settings2Icon } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { Capability } from "./chat-tools-menu.enabled-tool-summary";

export type ChatCapabilityCategory = "all" | Capability["category"];

export function ChatCapabilitySearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div
      className="shrink-0 px-3 pb-3"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={label}
          className="h-10 rounded-xl border-transparent bg-muted/65 pl-9 text-sm shadow-none"
        />
      </div>
    </div>
  );
}

export function ChatCapabilitySidebar({
  category,
  setCategory,
  capabilities,
  label,
  groupLabel,
}: {
  category: ChatCapabilityCategory;
  setCategory: (value: ChatCapabilityCategory) => void;
  capabilities: Capability[];
  label: string;
  groupLabel: (value: Capability["category"]) => string;
}) {
  return (
    <aside
      className="flex min-w-0 gap-1 overflow-x-auto border-b border-border/55 p-2 sm:flex-col sm:overflow-x-visible sm:border-b-0 sm:border-r"
      aria-label={label}
    >
      {(["all", "tools", "mcp", "knowledge", "skills"] as const).map(
        (value) => {
          const count =
            value === "all"
              ? capabilities.length
              : capabilities.filter((item) => item.category === value).length;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
              className={cn(
                "flex min-h-9 shrink-0 items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[0.68rem] font-medium sm:w-full",
                category === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span>{value === "all" ? label : groupLabel(value)}</span>
              <span className="font-mono text-[0.6rem]">{count}</span>
            </button>
          );
        },
      )}
    </aside>
  );
}

export function ChatCapabilityFooter({
  agentId,
  chatOnly,
  customize,
}: {
  agentId: string;
  chatOnly: string;
  customize: string;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-3">
      <p className="min-w-0 truncate pl-1 text-[0.66rem] text-muted-foreground">
        {chatOnly}
      </p>
      <DropdownMenuGroup>
        <DropdownMenuItem
          asChild
          className="min-h-10 cursor-pointer px-3 text-xs font-medium"
        >
          <Link href={`/agents/${agentId}`} className="gap-2">
            <Settings2Icon data-icon="inline-start" aria-hidden="true" />
            {customize}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </div>
  );
}
