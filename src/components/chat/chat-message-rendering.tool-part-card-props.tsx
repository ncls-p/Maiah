"use client";

import {
  type ChatMessage,
  type ChatMessagePart,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import { type WorkspaceArtifactDisplay } from "@/components/chat/code-workspace-artifact-card";
import type { ToolVisualState } from "@/components/chat/tool-state-icon";
import { cn } from "@/lib/utils";
import type * as React from "react";

export type ToolPartCardProps = {
  part: ChatMessagePart;
  sequence: number;
  messageStatus?: ChatMessage["status"];
  approval?: PendingToolApproval;
  workspaceId?: string;
  workspaceArtifactDisplay?: WorkspaceArtifactDisplay;
  onApprove?: (approval: PendingToolApproval) => void;
  onReject?: (approval: PendingToolApproval) => void;
};

export function ToolSequenceBadge({
  sequence,
  compact = false,
}: {
  sequence: number;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-md bg-primary/[0.08] font-mono font-medium tabular-nums text-primary",
        compact
          ? "size-5 text-[9px]"
          : "size-7 rounded-lg text-[10px]",
      )}
    >
      {String(sequence).padStart(2, "0")}
    </span>
  );
}

export function ToolStatusDot({
  state,
  compact = false,
}: {
  state: ToolVisualState;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border-2 border-current",
        compact ? "size-1.5" : "size-2",
        state === "pending" &&
          "animate-spin border-r-transparent text-primary motion-reduce:animate-pulse",
        state === "approval" &&
          "text-warning shadow-[0_0_0_4px_color-mix(in_oklch,var(--warning)_10%,transparent)]",
        state === "completed" && "bg-success text-success",
        state === "warning" && "bg-warning text-warning",
        state === "error" && "bg-destructive text-destructive",
      )}
      aria-hidden="true"
    />
  );
}

export function ToolCardHeader({
  sequence,
  title,
  subtitle,
  state,
  action,
  compact = false,
}: {
  sequence: number;
  title: string;
  subtitle: React.ReactNode;
  state: ToolVisualState;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        compact
          ? "min-h-8 gap-2 px-2 py-1 group-data-[open=true]/tool:border-b group-data-[open=true]/tool:border-border/40"
          : "min-h-12 gap-2.5 border-b border-border/45 px-3 py-2",
      )}
    >
      <ToolSequenceBadge sequence={sequence} compact={compact} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-semibold tracking-[-0.01em] text-foreground",
            compact ? "text-[11px] leading-4" : "text-xs",
          )}
        >
          {title}
        </p>
        <p className="flex min-w-0 items-center gap-1 truncate text-[10px] leading-4 text-muted-foreground">
          {subtitle}
        </p>
      </div>
      {action}
      <ToolStatusDot state={state} compact={compact} />
    </div>
  );
}
