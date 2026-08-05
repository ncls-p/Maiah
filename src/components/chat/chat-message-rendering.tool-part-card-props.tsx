"use client";

import {
type ChatMessage,
type ChatMessagePart,
type PendingToolApproval
} from "@/components/chat/chat-types";
import {
type WorkspaceArtifactDisplay
} from "@/components/chat/code-workspace-artifact-card";
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

export function ToolSequenceBadge({ sequence }: { sequence: number }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/[0.08] font-mono text-[10px] font-medium tabular-nums text-primary">
      {String(sequence).padStart(2, "0")}
    </span>
  );
}

export function ToolStatusDot({ state }: { state: ToolVisualState }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full border-2 border-current",
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
}: {
  sequence: number;
  title: string;
  subtitle: React.ReactNode;
  state: ToolVisualState;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-2.5 border-b border-border/45 px-3 py-2">
      <ToolSequenceBadge sequence={sequence} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </p>
        <p className="flex min-w-0 items-center gap-1 truncate text-[10px] leading-4 text-muted-foreground">
          {subtitle}
        </p>
      </div>
      {action}
      <ToolStatusDot state={state} />
    </div>
  );
}
