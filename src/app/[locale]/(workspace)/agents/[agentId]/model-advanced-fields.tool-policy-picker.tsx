import { ShieldAlertIcon, ShieldXIcon, WrenchIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { AgentToolPolicyOption } from "./types";

export function ToolPolicyPicker({
  options,
  approvalNames,
  deniedNames,
  onChange,
  labels,
}: {
  options: AgentToolPolicyOption[];
  approvalNames: string[];
  deniedNames: string[];
  onChange: (value: { approvalNames: string[]; deniedNames: string[] }) => void;
  labels: {
    empty: string;
    approval: string;
    denied: string;
    builtin: string;
    custom: string;
    mcp: string;
  };
}) {
  const approvals = new Set(approvalNames);
  const denied = new Set(deniedNames);
  function toggle(
    name: string,
    policy: "approval" | "denied",
    checked: boolean,
  ) {
    const nextApprovals = new Set(approvals);
    const nextDenied = new Set(denied);
    const target = policy === "approval" ? nextApprovals : nextDenied;
    const opposite = policy === "approval" ? nextDenied : nextApprovals;
    if (checked) {
      target.add(name);
      opposite.delete(name);
    } else target.delete(name);
    onChange({
      approvalNames: [...nextApprovals],
      deniedNames: [...nextDenied],
    });
  }
  if (options.length === 0)
    return (
      <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
        {labels.empty}
      </p>
    );
  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-2 border-b bg-muted/35 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
        <span className="sr-only">Tools</span>
        <span className="text-center">{labels.approval}</span>
        <span className="text-center">{labels.denied}</span>
      </div>
      <div className="max-h-72 divide-y overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        {options.map((option) => (
          <div
            key={`${option.source}:${option.name}`}
            className="grid min-h-14 grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-2 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <WrenchIcon
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span
                className="truncate text-sm font-medium"
                title={option.label}
              >
                {option.label}
              </span>
              <Badge
                variant="outline"
                className="hidden shrink-0 text-[10px] sm:inline-flex"
              >
                {labels[option.source]}
              </Badge>
            </div>
            <label
              className="flex min-h-10 cursor-pointer items-center justify-center"
              title={labels.approval}
            >
              <Checkbox
                checked={approvals.has(option.name)}
                onCheckedChange={(value) =>
                  toggle(option.name, "approval", value === true)
                }
                aria-label={`${labels.approval}: ${option.label}`}
              />
              <ShieldAlertIcon
                className="ml-1.5 size-3.5 text-warning"
                aria-hidden="true"
              />
            </label>
            <label
              className="flex min-h-10 cursor-pointer items-center justify-center"
              title={labels.denied}
            >
              <Checkbox
                checked={denied.has(option.name)}
                onCheckedChange={(value) =>
                  toggle(option.name, "denied", value === true)
                }
                aria-label={`${labels.denied}: ${option.label}`}
              />
              <ShieldXIcon
                className="ml-1.5 size-3.5 text-destructive"
                aria-hidden="true"
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
