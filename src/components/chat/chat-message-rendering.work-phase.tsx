"use client";

import {
  formatToolName,
  knowledgeSearchResultsFromUnknown,
} from "@/components/chat/chat-message-rendering-utils";
import {
  parseToolPart,
  resolveWorkPhaseOutcome,
  type ChatMessage,
  type ChatMessagePart,
} from "@/components/chat/chat-types";
import type { ToolVisualState } from "@/components/chat/tool-state-icon";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { parseAgentToolDisplayContext } from "@/modules/agent/tool-progress-payload";
import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type * as React from "react";
import { useState } from "react";
import {
  BUTTON_TYPE,
  GHOST_VARIANT,
} from "./chat-message-rendering.rich-editor";
import {
  ToolSequenceBadge,
  ToolStatusDot,
} from "./chat-message-rendering.tool-part-card-props";

export function WorkPhase({
  parts,
  sequence,
  hasVisibleResponseAfter,
  hasPendingApproval,
  messageStatus,
  children,
}: {
  parts: Array<{ part: ChatMessagePart; partIndex: number }>;
  sequence: number;
  hasVisibleResponseAfter: boolean;
  hasPendingApproval: boolean;
  messageStatus?: ChatMessage["status"];
  children: React.ReactNode;
}) {
  const t = useTranslations("chat.rendering");
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const outcome = resolveWorkPhaseOutcome({
    parts: parts.map(({ part }) => part),
    messageStatus,
    hasVisibleResponseAfter,
  });
  const visualState: ToolVisualState = hasPendingApproval
    ? "approval"
    : outcome === "pending"
      ? "pending"
      : outcome === "interrupted"
        ? "error"
        : outcome === "completed-with-issues"
          ? "warning"
          : "completed";
  const specialistNames = Array.from(
    new Set(
      parts.flatMap(({ part }) => {
        if (part.type !== "tool-call" && part.type !== "tool-result") return [];
        const context = parseAgentToolDisplayContext(
          parseToolPart(part.content).agentContext,
        );
        return context && context.depth > 0 ? [context.agentName] : [];
      }),
    ),
  );
  const hasSpecialistActivity =
    specialistNames.length > 0 ||
    parts.some(
      ({ part }) =>
        (part.type === "tool-call" || part.type === "tool-result") &&
        (parseToolPart(part.content).toolName?.startsWith(
          "delegate_specialist_",
        ) ??
          false),
    );
  const autoOpen =
    hasPendingApproval ||
    (!hasSpecialistActivity &&
      (outcome === "pending" ||
        outcome === "interrupted" ||
        (messageStatus === "streaming" && !hasVisibleResponseAfter)));
  const open = manualOpen ?? autoOpen;

  const detailedActivityLabels = Array.from(
    new Set(
      parts.map(({ part }) => {
        if (part.type === "reasoning") return t("workPhaseReasoning");
        const parsed = parseToolPart(part.content);
        if (parsed.toolName?.startsWith("delegate_")) return t("delegation");
        if (parsed.toolName === "search_knowledge") {
          return t("knowledgeSearch");
        }
        if (parsed.toolName === "read_knowledge_context") {
          return t("knowledgeContext");
        }
        const toolName = parsed.toolName
          ? formatToolName(parsed.toolName)
          : t("workPhaseTool");
        const context = parseAgentToolDisplayContext(parsed.agentContext);
        return context && context.depth > 0
          ? t("specialistActivity", {
              name: context.agentName,
              action: toolName,
            })
          : toolName;
      }),
    ),
  );
  const activityLabels = hasSpecialistActivity
    ? [t("specialistWork"), ...specialistNames]
    : detailedActivityLabels;
  const visibleActivities = activityLabels.slice(0, 3);
  const hiddenActivityCount = activityLabels.length - visibleActivities.length;
  const statusLabel =
    (() => {
      const knowledgeResults = parts.flatMap(({ part }) => {
        if (part.type !== "tool-call" && part.type !== "tool-result") return [];
        const parsed = parseToolPart(part.content);
        return parsed.toolName === "search_knowledge"
          ? (knowledgeSearchResultsFromUnknown(parsed.output) ?? [])
          : [];
      });
      const knowledgeOnly = parts.every(({ part }) => {
        if (part.type === "reasoning") return true;
        const toolName = parseToolPart(part.content).toolName;
        return (
          toolName === "search_knowledge" ||
          toolName === "read_knowledge_context"
        );
      });
      if (!knowledgeOnly) return null;
      if (visualState === "pending") return t("knowledgeSearching");
      if (visualState !== "completed") return null;
      const documentCount = new Set(
        knowledgeResults.map((result) => result.documentId),
      ).size;
      return documentCount > 0
        ? t("knowledgeSearchedDocuments", { count: documentCount })
        : t("knowledgeNoResults");
    })() ??
    (hasSpecialistActivity
      ? visualState === "pending"
        ? t("specialistWorkActive")
        : visualState === "error"
          ? t("specialistWorkFailed")
          : visualState === "warning"
            ? t("specialistWorkCompleteWithIssues")
            : t("specialistWorkComplete")
      : visualState === "approval"
        ? t("actionApproval")
        : visualState === "pending"
          ? t("workPhaseActive")
          : visualState === "error"
            ? t("workPhaseFailed")
            : visualState === "warning"
              ? t("workPhaseCompleteWithIssues")
              : t("workPhaseComplete"));

  return (
    <Collapsible
      open={open}
      onOpenChange={setManualOpen}
      data-open={String(open)}
      className={cn(
        "t-acc group/work-phase w-full overflow-hidden rounded-xl border border-border/55 bg-card/70 text-xs shadow-[var(--control-shadow)] transition-[background-color,border-color,box-shadow] duration-150 ease-out",
        visualState === "approval" && "border-warning/25 bg-warning/[0.025]",
        visualState === "pending" && "border-primary/20 bg-primary/[0.025]",
        visualState === "warning" && "border-warning/25 bg-warning/[0.02]",
        visualState === "error" &&
          "border-destructive/25 bg-destructive/[0.02]",
      )}
    >
      <div className="flex min-h-10 items-center gap-2 border-b border-border/40 px-2.5 py-1.5">
        <ToolSequenceBadge sequence={sequence} compact />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "shrink-0 text-[12px] font-medium tracking-[-0.01em] text-foreground",
                visualState === "pending" && "t-shimmer",
              )}
              data-text={visualState === "pending" ? statusLabel : undefined}
              aria-live="polite"
            >
              {statusLabel}
            </span>
            <span className="truncate text-[10px] text-muted-foreground/70">
              {t("workPhaseSteps", { count: parts.length })}
            </span>
            {visualState === "pending" ? (
              <span
                className="streaming-thinking__dots text-primary"
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-1 overflow-hidden text-[10px] leading-4 text-muted-foreground">
            {visibleActivities.map((activity, activityIndex) => (
              <span key={activity} className="inline-flex min-w-0 items-center">
                {activityIndex > 0 ? (
                  <span className="mx-1 text-border" aria-hidden="true">
                    ·
                  </span>
                ) : null}
                <span className="truncate">{activity}</span>
              </span>
            ))}
            {hiddenActivityCount > 0 ? (
              <span className="shrink-0 text-muted-foreground/70">
                {t("workPhaseMore", { count: hiddenActivityCount })}
              </span>
            ) : null}
          </div>
        </div>
        <CollapsibleTrigger asChild>
          <Button
            type={BUTTON_TYPE}
            variant={GHOST_VARIANT}
            size="sm"
            className="h-8 shrink-0 rounded-lg px-2 text-[11px] text-muted-foreground transition-transform hover:text-foreground active:scale-[0.96]"
            aria-label={
              hasSpecialistActivity
                ? open
                  ? t("specialistDetailsHide")
                  : t("specialistDetailsView")
                : open
                  ? t("workPhaseHide")
                  : t("workPhaseView")
            }
          >
            <span className="t-acc-chevron">
              <ChevronDownIcon className="size-3" aria-hidden="true" />
            </span>
            {open ? t("reasoningHide") : t("reasoningView")}
          </Button>
        </CollapsibleTrigger>
        <ToolStatusDot state={visualState} compact />
      </div>
      <CollapsibleContent
        forceMount
        className="t-acc-panel"
        hidden={!open}
        aria-hidden={!open}
        inert={!open ? true : undefined}
      >
        <div className="t-acc-panel-inner">
          <div className="space-y-1 bg-background/15 p-1.5">{children}</div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
