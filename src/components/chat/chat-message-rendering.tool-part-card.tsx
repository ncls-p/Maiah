"use client";

import { CodeSandboxResultCard,HtmlArtifactCard,LiveToolInputCard } from "@/components/chat/chat-artifact-renderers";
import { chatFileAttachmentFromPartContent,chatImageAttachmentFromPartContent,codeSandboxInputFromInputText,codeSandboxInputFromUnknown,codeSandboxOutputFromUnknown,codeSandboxToolVisualState,codeWorkspaceArtifactFromPartContent,delegationFailureDetails,formatToolName,htmlArtifactFromInputText,htmlArtifactFromToolInput,isCodeSandboxToolName,isGeneratedImageOutput,isGitHubPublishOutput,isHtmlArtifactOutput,knowledgeContextChunkCount,knowledgeSearchResultsFromUnknown,summarizeToolBody } from "@/components/chat/chat-message-rendering-utils";
import { parseToolPart,resolveToolDisplayStatus } from "@/components/chat/chat-types";
import { ChatFileAttachmentCard,ChatImageAttachmentCard,CodeWorkspaceArtifactCard,CodeWorkspaceArtifactSummary,GitHubPublishResultCard,isCodeWorkspaceArtifactOutput } from "@/components/chat/code-workspace-artifact-card";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
import { Button } from "@/components/ui/button";
import { Collapsible,CollapsibleContent,CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { parseAgentToolDisplayContext } from "@/modules/agent/tool-progress-payload";
import { CheckIcon,ChevronDownIcon,XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type * as React from "react";
import { memo,useMemo,useState } from "react";
import { areToolPartCardPropsEqual } from "./chat-message-rendering.are-tool-part-card-props-equal";
import { BUTTON_TYPE,COMPACT_ICON_CLASS,GHOST_VARIANT,OUTLINE_VARIANT,formatExpandedToolValue } from "./chat-message-rendering.rich-editor";
import { ToolCardHeader,ToolPartCardProps } from "./chat-message-rendering.tool-part-card-props";

export const ToolPartCard = memo(function ToolPartCard({ part, sequence, messageStatus, approval, workspaceId, workspaceArtifactDisplay = "full", onApprove, onReject }: ToolPartCardProps) {
  const t = useTranslations("chat.rendering");
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseToolPart(part.content), [part.content]);
  const agentContext = useMemo(() => parseAgentToolDisplayContext(parsed.agentContext), [parsed.agentContext]);
  const fileArtifact = useMemo(() => (part.type === "file" ? codeWorkspaceArtifactFromPartContent(part.content) : null), [part.content, part.type]);
  const imageAttachment = useMemo(() => (part.type === "file" ? chatImageAttachmentFromPartContent(part.content) : null), [part.content, part.type]);
  const fileAttachment = useMemo(() => (part.type === "file" ? chatFileAttachmentFromPartContent(part.content) : null), [part.content, part.type]);
  const isDelegation = parsed.toolName?.startsWith("delegate_") ?? false;
  const isKnowledgeSearch = parsed.toolName === "search_knowledge";
  const isKnowledgeContext = parsed.toolName === "read_knowledge_context";
  const friendlyName = useMemo(() => (isDelegation ? t("delegation") : isKnowledgeSearch ? t("knowledgeSearch") : isKnowledgeContext ? t("knowledgeContext") : formatToolName(parsed.toolName)), [isDelegation, isKnowledgeContext, isKnowledgeSearch, parsed.toolName, t]);
  const status = useMemo(() => {
    return resolveToolDisplayStatus(parsed, messageStatus);
  }, [messageStatus, parsed]);
  const hasResult = parsed.output !== undefined;
  const approvalMatches = Boolean(approval);
  const visualState = approvalMatches ? "approval" : codeSandboxToolVisualState(parsed.output, status);
  const statusLabel = visualState === "approval" ? t("actionApproval") : visualState === "pending" ? t("actionRunning") : visualState === "error" ? t("actionFailed") : t("actionCompleted");
  const displayInput = approvalMatches ? approval?.input : parsed.input;
  const delegationFailure = useMemo(() => delegationFailureDetails(parsed.output), [parsed.output]);

  const inputArtifact = useMemo(() => (approvalMatches ? null : htmlArtifactFromToolInput(parsed.input)), [approvalMatches, parsed.input]);
  const streamingInputArtifact = useMemo(() => (approvalMatches || parsed.streamingInput ? null : htmlArtifactFromInputText(parsed.inputText)), [approvalMatches, parsed.inputText, parsed.streamingInput]);
  const sandboxOutput = useMemo(() => codeSandboxOutputFromUnknown(parsed.output), [parsed.output]);
  const sandboxInput = useMemo(() => codeSandboxInputFromUnknown(parsed.input), [parsed.input]);
  const liveSandboxInput = useMemo(() => (isCodeSandboxToolName(parsed.toolName) ? codeSandboxInputFromInputText(parsed.inputText) : null), [parsed.inputText, parsed.toolName]);
  const summaryText = useMemo(() => {
    if (isDelegation && status === "completed") {
      const output = parsed.output;
      const childName = typeof output === "object" && output !== null && typeof (output as { childAgentName?: unknown }).childAgentName === "string" ? (output as { childAgentName: string }).childAgentName : null;
      return childName ? t("delegationCompletedBy", { name: childName }) : t("delegationCompleted");
    }
    if (isDelegation && status === "error") {
      const reason = (() => {
        switch (delegationFailure.errorCode) {
          case "AGENT_TOKEN_BUDGET_EXCEEDED":
            return t("delegationFailureTokenBudget");
          case "AGENT_DELEGATION_FORBIDDEN":
          case "AGENT_RUN_FORBIDDEN":
            return t("delegationFailurePermission");
          case "AGENT_DELEGATION_DEPTH_EXCEEDED":
            return t("delegationFailureDepth");
          case "AGENT_DELEGATION_CYCLE":
            return t("delegationFailureCycle");
          case "AGENT_DELEGATION_PARALLEL_LIMIT":
            return t("delegationFailureParallelLimit");
          case "AGENT_DELEGATION_LIMIT":
            return t("delegationFailureDelegationLimit");
          case "AGENT_DELEGATION_DEADLINE_EXCEEDED":
            return t("delegationFailureDeadline");
          case "AGENT_MODEL_NOT_CONFIGURED":
            return t("delegationFailureModelConfiguration");
          case "AGENT_EMPTY_RESPONSE":
            return t("delegationFailureEmptyResponse");
          case "AGENT_NOT_FOUND":
          case "AGENT_VERSION_NOT_FOUND":
            return t("delegationFailureSpecialistUnavailable");
          case "AGENT_RUN_CANCELLED":
            return t("delegationFailureCancelled");
          default:
            return delegationFailure.reason;
        }
      })();
      return reason ? t("delegationFailedWithReason", { reason }) : t("delegationFailed");
    }
    if (status === "error" && (parsed.invalid || parsed.error != null)) {
      return t("actionUnavailable");
    }
    if (isKnowledgeSearch) {
      if (status === "pending") return t("knowledgeSearching");
      const results = knowledgeSearchResultsFromUnknown(parsed.output);
      if (results) {
        const documentCount = new Set(results.map((result) => result.documentId)).size;
        return documentCount > 0 ? t("knowledgeSearchedDocuments", { count: documentCount }) : t("knowledgeNoResults");
      }
    }
    if (isKnowledgeContext) {
      if (status === "pending") return t("knowledgeReadingContext");
      const chunkCount = knowledgeContextChunkCount(parsed.output);
      if (chunkCount !== null) {
        return t("knowledgeReadChunks", { count: chunkCount });
      }
    }
    if (status === "pending") {
      return summarizeToolInput(friendlyName, displayInput);
    }
    if (hasResult) {
      return summarizeToolBody(parsed.toolName, parsed.output, false);
    }
    return "";
  }, [friendlyName, hasResult, isDelegation, isKnowledgeContext, isKnowledgeSearch, displayInput, delegationFailure, parsed.error, parsed.invalid, parsed.output, parsed.toolName, status, t]);
  const inputText = useMemo(() => formatExpandedToolValue(displayInput, open), [displayInput, open]);
  const outputText = useMemo(() => formatExpandedToolValue(parsed.output, open), [open, parsed.output]);

  let specializedContent: React.ReactNode = null;
  if (fileArtifact) {
    specializedContent = workspaceArtifactDisplay === "summary" ? <CodeWorkspaceArtifactSummary artifact={fileArtifact} /> : <CodeWorkspaceArtifactCard artifact={fileArtifact} workspaceId={workspaceId} />;
  } else if (imageAttachment) {
    specializedContent = <ChatImageAttachmentCard attachment={imageAttachment} />;
  } else if (fileAttachment) {
    specializedContent = <ChatFileAttachmentCard attachment={fileAttachment} />;
  } else if (sandboxOutput) {
    specializedContent = <CodeSandboxResultCard result={sandboxOutput} input={sandboxInput} embedded />;
  } else if (isHtmlArtifactOutput(parsed.output)) {
    specializedContent = <HtmlArtifactCard artifact={parsed.output} embedded />;
  } else if (isGeneratedImageOutput(parsed.output)) {
    const impact = parsed.output.impact;
    const metrics = [impact.cost === null ? null : `${impact.cost.toFixed(4)} ${impact.currency}`, impact.energyKwh === null ? null : `${impact.energyKwh.toFixed(4)} kWh`, impact.co2Grams === null ? null : `${impact.co2Grams.toFixed(2)} gCO₂e`].filter((metric): metric is string => Boolean(metric));
    specializedContent = (
      <div className="space-y-2">
        <ChatImageAttachmentCard attachment={parsed.output.attachment} />
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          <span>
            {parsed.output.provider} · {parsed.output.model}
          </span>
          {metrics.map((metric) => (
            <span key={metric} className="rounded-full bg-muted px-2 py-0.5">
              {metric}
            </span>
          ))}
        </div>
      </div>
    );
  } else if (isCodeWorkspaceArtifactOutput(parsed.output)) {
    specializedContent = workspaceArtifactDisplay === "summary" ? <CodeWorkspaceArtifactSummary artifact={parsed.output} /> : <CodeWorkspaceArtifactCard artifact={parsed.output} workspaceId={workspaceId} />;
  } else if (isGitHubPublishOutput(parsed.output)) {
    specializedContent = <GitHubPublishResultCard result={parsed.output} />;
  } else if (inputArtifact) {
    specializedContent = <HtmlArtifactCard artifact={inputArtifact} isLive embedded />;
  } else if (parsed.streamingInput && parsed.inputText !== undefined) {
    specializedContent = <LiveToolInputCard toolName={friendlyName} inputText={parsed.inputText} sandboxInput={liveSandboxInput} embedded />;
  } else if (streamingInputArtifact) {
    specializedContent = <HtmlArtifactCard artifact={streamingInputArtifact} isLive embedded />;
  }

  if (specializedContent) {
    return (
      <section className={cn("w-full overflow-hidden rounded-[15px] border border-border/60 bg-card/75 text-xs shadow-[0_12px_35px_-24px_color-mix(in_oklch,var(--foreground)_35%,transparent)]", agentContext && agentContext.depth > 0 && "ml-4 border-l-2 border-l-primary/35 sm:ml-6")}>
        <ToolCardHeader
          sequence={sequence}
          title={friendlyName}
          subtitle={
            <>
              {agentContext?.agentName ? (
                <>
                  <span className="truncate">{agentContext.agentName}</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span className="truncate">{parsed.toolName ?? friendlyName}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{statusLabel}</span>
            </>
          }
          state={visualState}
        />
        <div className="bg-background/20 p-2.5">{specializedContent}</div>
      </section>
    );
  }

  const detailsOpen = open || visualState === "pending" || visualState === "approval";

  return (
    <Collapsible open={detailsOpen} onOpenChange={setOpen} data-open={String(detailsOpen)} className={cn("t-acc group/tool relative w-full overflow-hidden rounded-[15px] border border-border/60 bg-card/75 text-xs shadow-[0_12px_35px_-24px_color-mix(in_oklch,var(--foreground)_35%,transparent)] transition-[background-color,border-color,box-shadow] duration-200 ease-out", agentContext && agentContext.depth > 0 && "ml-4 border-l-2 border-l-primary/35 sm:ml-6", visualState === "approval" && "border-warning/25 bg-warning/[0.025]", visualState === "pending" && "border-primary/20 bg-primary/[0.025]", visualState === "error" && "border-destructive/25 bg-destructive/[0.02]")}>
      <ToolCardHeader
        sequence={sequence}
        title={friendlyName}
        subtitle={
          <>
            {agentContext?.agentName ? (
              <>
                <span className="truncate">{agentContext.agentName}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            <span className="truncate">{parsed.toolName ?? friendlyName}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{statusLabel}</span>
          </>
        }
        state={visualState}
        action={
          visualState === "completed" || visualState === "error" ? (
            <CollapsibleTrigger asChild>
              <Button type={BUTTON_TYPE} variant={GHOST_VARIANT} size="icon-sm" className="size-8 shrink-0 rounded-lg text-muted-foreground" aria-label={detailsOpen ? t("hideActionDetails") : t("showActionDetails")}>
                <ChevronDownIcon className={cn("size-3.5 transition-transform duration-200", detailsOpen && "rotate-180")} aria-hidden="true" />
              </Button>
            </CollapsibleTrigger>
          ) : null
        }
      />
      {agentContext ? (
        <span className="sr-only" aria-live="polite">
          {status === "pending" ? t("agentActionRunning", { name: agentContext.agentName }) : status === "error" ? t("agentActionFailed", { name: agentContext.agentName }) : t("agentActionCompleted", { name: agentContext.agentName })}
        </span>
      ) : null}
      {approval ? (
        <div className="bg-warning/[0.035] px-3 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground">{t("approvalWaiting")}</p>
            <div className="flex shrink-0 justify-end gap-1.5">
              <Button type={BUTTON_TYPE} size="sm" variant={OUTLINE_VARIANT} className="h-10 rounded-xl px-3 text-[11px]" onClick={() => onReject?.(approval)}>
                <XIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                {t("reject")}
              </Button>
              <Button type={BUTTON_TYPE} size="sm" className="h-10 rounded-xl px-3 text-[11px]" onClick={() => onApprove?.(approval)}>
                <CheckIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                {t("approve")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <CollapsibleContent forceMount className="t-acc-panel" aria-hidden={!detailsOpen} inert={!detailsOpen ? true : undefined}>
        <div className="t-acc-panel-inner">
          <div className="bg-background/25 px-3 py-3">
            {summaryText ? <p className="mb-2 text-[11px] leading-4 text-muted-foreground">{summaryText}</p> : null}
            {inputText ? (
              <div className="mb-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t("actionInput")}</div>
                <pre className="max-h-40 overflow-auto rounded-xl bg-muted/25 p-3 leading-4 text-[11px] text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]">{inputText}</pre>
              </div>
            ) : null}
            {outputText ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t("actionOutput")}</div>
                <pre className="max-h-60 overflow-auto rounded-xl bg-muted/25 p-3 leading-4 text-[11px] text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]">{outputText}</pre>
              </div>
            ) : null}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}, areToolPartCardPropsEqual);
