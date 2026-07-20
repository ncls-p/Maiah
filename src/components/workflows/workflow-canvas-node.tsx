"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import {
  ArrowDownUpIcon,
  BotIcon,
  BracesIcon,
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
  "date.now": CalendarClockIcon,
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
            category === "ai"
              ? "bg-primary/10 text-primary"
              : category === "logic"
                ? "bg-accent text-accent-foreground"
                : category === "integration"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-foreground",
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
          <div className="mt-3 flex justify-between text-[10px] font-medium text-muted-foreground">
            <span>{t("false")}</span>
            <span>{t("true")}</span>
          </div>
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            style={{ left: "25%" }}
            className="!size-3 !border-2 !border-card !bg-destructive"
          />
          <Handle
            id="true"
            type="source"
            position={Position.Bottom}
            style={{ left: "75%" }}
            className="!size-3 !border-2 !border-card !bg-primary"
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
