"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import {
  ArrowDownUpIcon,
  BotIcon,
  BracesIcon,
  BugIcon,
  CalculatorIcon,
  CalendarClockIcon,
  CaseSensitiveIcon,
  CircleStopIcon,
  Code2Icon,
  FileJsonIcon,
  GitBranchIcon,
  ListFilterIcon,
  ListPlusIcon,
  ListXIcon,
  PlayIcon,
  ReplaceIcon,
  Rows3Icon,
  TextCursorInputIcon,
  TimerIcon,
  WebhookIcon,
  WrenchIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { workflowNodeCatalogItem } from "@/modules/workflows/catalog";
import type { WorkflowNodeType } from "@/modules/workflows/contracts";

import type { WorkflowCanvasData } from "./types";

export type WorkflowCanvasNodeType = Node<WorkflowCanvasData, "workflow">;

export const workflowNodeIconByType: Record<WorkflowNodeType, LucideIcon> = {
  "trigger.manual": PlayIcon,
  "agent.run": BotIcon,
  "tool.call": WrenchIcon,
  "workflow.run": WorkflowIcon,
  "http.request": WebhookIcon,
  "code.execute": Code2Icon,
  "data.set": ListPlusIcon,
  "data.pick": ListFilterIcon,
  "data.remove": ListXIcon,
  "data.rename": ReplaceIcon,
  "data.template": TextCursorInputIcon,
  "data.parseJson": BracesIcon,
  "data.stringifyJson": FileJsonIcon,
  "text.transform": CaseSensitiveIcon,
  "number.calculate": CalculatorIcon,
  "list.filter": ListFilterIcon,
  "list.sort": ArrowDownUpIcon,
  "list.slice": Rows3Icon,
  "logic.condition": GitBranchIcon,
  "logic.delay": TimerIcon,
  "logic.stop": CircleStopIcon,
  "debug.snapshot": BugIcon,
  "date.now": CalendarClockIcon,
};

export const workflowCategoryColors = {
  trigger: {
    icon: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    surface: "border-emerald-500/35 bg-emerald-500/5",
  },
  ai: {
    icon: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    surface: "border-violet-500/35 bg-violet-500/5",
  },
  integration: {
    icon: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    surface: "border-sky-500/35 bg-sky-500/5",
  },
  data: {
    icon: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
    surface: "border-cyan-500/35 bg-cyan-500/5",
  },
  logic: {
    icon: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    surface: "border-amber-500/35 bg-amber-500/5",
  },
  code: {
    icon: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    surface: "border-rose-500/35 bg-rose-500/5",
  },
};

function nodeSummary(data: WorkflowCanvasData, category: string) {
  const parameters = data.parameters;
  if (data.workflowType === "http.request")
    return `${String(parameters.method ?? "GET")} · ${String(parameters.url ?? "")}`;
  if (data.workflowType === "logic.condition")
    return `${String(parameters.path ?? "")} · ${String(parameters.operator ?? "equals")}`;
  if (data.workflowType === "logic.delay")
    return `${String(parameters.delayMs ?? 0)} ms`;
  if (data.workflowType === "data.template")
    return `→ ${String(parameters.outputPath ?? "")}`;
  return category;
}

export function WorkflowCanvasNode({
  data,
  selected,
}: NodeProps<WorkflowCanvasNodeType>) {
  const t = useTranslations("workflows");
  const Icon = workflowNodeIconByType[data.workflowType];
  const isTrigger = data.workflowType === "trigger.manual";
  const isCondition = data.workflowType === "logic.condition";
  const isTerminal = data.workflowType === "logic.stop";
  const category = workflowNodeCatalogItem(data.workflowType).category;

  return (
    <div
      className={cn(
        "relative min-w-52 rounded-2xl border bg-card p-3 shadow-[var(--surface-shadow)] transition-[border-color,box-shadow,transform] duration-150",
        workflowCategoryColors[category].surface,
        isCondition && "pr-14",
        selected
          ? "border-foreground/45 shadow-lg ring-4 ring-foreground/5"
          : "hover:shadow-md",
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
            workflowCategoryColors[category].icon,
          )}
        >
          <Icon aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.02em]">
            {data.label}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {nodeSummary(data, t(`categories.${category}`))}
          </p>
        </div>
      </div>
      {isCondition ? (
        <>
          <span className="absolute top-[38%] right-3 -translate-y-1/2 text-[9px] font-semibold text-primary">
            {t("true")}
          </span>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            style={{ top: "38%" }}
            className="!size-3 !border-2 !border-card !bg-primary"
          />
          <span className="absolute top-[72%] right-3 -translate-y-1/2 text-[9px] font-semibold text-destructive">
            {t("false")}
          </span>
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            style={{ top: "72%" }}
            className="!size-3 !border-2 !border-card !bg-destructive"
          />
        </>
      ) : !isTerminal ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-3 !border-2 !border-card !bg-foreground"
        />
      ) : null}
    </div>
  );
}
