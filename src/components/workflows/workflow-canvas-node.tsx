"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import {
  BotIcon,
  BracesIcon,
  Code2Icon,
  GitBranchIcon,
  PlayIcon,
  WebhookIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { WorkflowCanvasData } from "./types";

export type WorkflowCanvasNodeType = Node<WorkflowCanvasData, "workflow">;

const iconByType = {
  "trigger.manual": PlayIcon,
  "agent.run": BotIcon,
  "http.request": WebhookIcon,
  "code.execute": Code2Icon,
  "data.set": BracesIcon,
  "logic.condition": GitBranchIcon,
} as const;

const accentByType = {
  "trigger.manual": "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  "agent.run": "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  "http.request": "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  "code.execute": "bg-foreground/8 text-foreground",
  "data.set": "bg-teal-500/12 text-teal-700 dark:text-teal-300",
  "logic.condition": "bg-orange-500/12 text-orange-700 dark:text-orange-300",
} as const;

export function WorkflowCanvasNode({
  data,
  selected,
}: NodeProps<WorkflowCanvasNodeType>) {
  const Icon = iconByType[data.workflowType];
  const isTrigger = data.workflowType === "trigger.manual";
  const isCondition = data.workflowType === "logic.condition";

  return (
    <div
      className={cn(
        "min-w-52 rounded-2xl border bg-card p-3 shadow-[var(--surface-shadow)] transition-[border-color,box-shadow,transform] duration-150",
        selected
          ? "border-foreground/45 shadow-lg ring-4 ring-foreground/5"
          : "border-border/80 hover:border-foreground/25",
      )}
    >
      {!isTrigger ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-3 !border-2 !border-card !bg-foreground"
        />
      ) : null}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            accentByType[data.workflowType],
          )}
        >
          <Icon aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.02em]">
            {data.label}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {data.workflowType}
          </p>
        </div>
      </div>
      {isCondition ? (
        <>
          <div className="mt-3 flex justify-between text-[10px] font-medium text-muted-foreground">
            <span>faux</span>
            <span>vrai</span>
          </div>
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            style={{ left: "25%" }}
            className="!size-3 !border-2 !border-card !bg-orange-500"
          />
          <Handle
            id="true"
            type="source"
            position={Position.Bottom}
            style={{ left: "75%" }}
            className="!size-3 !border-2 !border-card !bg-emerald-500"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-3 !border-2 !border-card !bg-foreground"
        />
      )}
    </div>
  );
}
