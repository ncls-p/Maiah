"use client";

import { CheckIcon, CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const NONE = "__none__";

export type ChatAutomationConfig = {
  enabled: boolean;
  providerId?: string;
  modelId?: string;
  generateTitles: boolean;
  generateSuggestions: boolean;
};

export type ChatAutomationState = {
  config: ChatAutomationConfig;
  providers: Array<{ id: string; name: string; kind: string }>;
  models: Array<{
    id: string;
    providerId: string;
    modelId: string;
    displayName: string | null;
  }>;
};

export function ChecklistItem({
  done,
  label,
}: {
  done: boolean;
  label: string;
}) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckIcon
          className="size-4 shrink-0 text-emerald-600"
          aria-hidden="true"
        />
      ) : (
        <CircleIcon
          className="size-4 shrink-0 text-muted-foreground/70"
          aria-hidden="true"
        />
      )}
      <span className={cn(done ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
    </li>
  );
}
