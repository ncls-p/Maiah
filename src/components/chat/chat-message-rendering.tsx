"use client";

import dynamic from "next/dynamic";
import { memo, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type * as React from "react";
import {
  AlertTriangleIcon,
  BrainIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  XIcon,
} from "lucide-react";
import { CitationBlock } from "@/components/chat/citation-block";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import {
  citationsFromMessage,
  groupWorkPhaseParts,
  parseToolPart,
  reasoningPartHasDetails,
  renderablePartsFromMessage,
  resolveWorkPhaseOutcome,
  resolveToolDisplayStatus,
  textFromMessage,
  type ChatMessage,
  type ChatMessagePart,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import {
  ChatFileAttachmentCard,
  ChatImageAttachmentCard,
  CodeWorkspaceArtifactCard,
  CodeWorkspaceArtifactSummary,
  GitHubPublishResultCard,
  isCodeWorkspaceArtifactOutput,
  type WorkspaceArtifactDisplay,
} from "@/components/chat/code-workspace-artifact-card";
import type { RichEditorProps } from "@/components/chat/rich-editor";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
import {
  chatFileAttachmentFromPartContent,
  chatImageAttachmentFromPartContent,
  chatTodoListFromToolPart,
  codeSandboxInputFromInputText,
  codeSandboxInputFromUnknown,
  codeSandboxOutputFromUnknown,
  codeWorkspaceArtifactFromPartContent,
  delegationFailureDetails,
  formatToolName,
  htmlArtifactFromInputText,
  htmlArtifactFromToolInput,
  isCodeSandboxToolName,
  isGeneratedImageOutput,
  isGitHubPublishOutput,
  isHtmlArtifactOutput,
  summarizeToolBody,
  toolPartHasStandaloneRendering,
  toolPartMatchesApproval,
} from "@/components/chat/chat-message-rendering-utils";
import {
  CodeSandboxResultCard,
  HtmlArtifactCard,
  LiveToolInputCard,
} from "@/components/chat/chat-artifact-renderers";
import type { ToolVisualState } from "@/components/chat/tool-state-icon";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { parseAgentToolDisplayContext } from "@/modules/agent/tool-progress-payload";

const RichEditor = dynamic<RichEditorProps>(
  () => import("@/components/chat/rich-editor").then((mod) => mod.RichEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-32 w-full rounded-xl" />,
  },
);

const BUTTON_TYPE = "button";
const OUTLINE_VARIANT = "outline";
const GHOST_VARIANT = "ghost";
const COMPACT_ICON_CLASS = "size-3";

function StreamingThinking() {
  const t = useTranslations("chat.rendering");
  const label = t("thinking");
  return (
    <div className="streaming-thinking" aria-label={t("assistantThinking")}>
      <span className="streaming-thinking__text t-shimmer" data-text={label}>
        {label}
      </span>
      <span className="streaming-thinking__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

function ErrorPart({ part }: { part: ChatMessagePart }) {
  const t = useTranslations("chat.rendering");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const summary = part.content.split("\n", 1)[0]?.trim() || t("errorFallback");

  async function copyError() {
    try {
      await navigator.clipboard.writeText(part.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-2xl border border-destructive/20 bg-destructive/[0.035]"
    >
      <div className="flex min-w-0 items-center gap-3 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangleIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {t("errorTitle")}
          </p>
          <p className="truncate text-xs text-muted-foreground">{summary}</p>
        </div>
        <CollapsibleTrigger asChild>
          <Button type={BUTTON_TYPE} size="sm" variant={GHOST_VARIANT}>
            {open ? t("errorHide") : t("errorView")}
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform duration-200",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
        <Button
          type={BUTTON_TYPE}
          size="sm"
          variant={OUTLINE_VARIANT}
          onClick={() => void copyError()}
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-success" aria-hidden="true" />
          ) : (
            <CopyIcon className="size-3.5" aria-hidden="true" />
          )}
          {copied ? t("errorCopied") : t("errorCopy")}
        </Button>
      </div>
      <CollapsibleContent>
        <pre className="max-h-72 overflow-auto border-t border-destructive/10 px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
          {part.content}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function StreamingStatus() {
  const t = useTranslations("chat.rendering");
  const label = t("generating");
  return (
    <span className="streaming-status" aria-label={t("assistantGenerating")}>
      <span className="streaming-status__dot" aria-hidden="true" />
      <span className="t-shimmer" data-text={label}>
        {label}
      </span>
    </span>
  );
}

function PendingApprovalCard({
  pendingApproval,
  sequence,
  onApprove,
  onReject,
}: {
  pendingApproval: PendingToolApproval;
  sequence: number;
  onApprove?: (approval: PendingToolApproval) => void;
  onReject?: (approval: PendingToolApproval) => void;
}) {
  const t = useTranslations("chat.rendering");
  const friendlyName = formatToolName(pendingApproval.toolName);
  const summary = summarizeToolInput(friendlyName, pendingApproval.input);

  return (
    <div className="w-full overflow-hidden rounded-[15px] border border-warning/25 bg-warning/[0.025] text-xs shadow-[0_12px_35px_-24px_color-mix(in_oklch,var(--warning)_45%,transparent)]">
      <ToolCardHeader
        sequence={sequence}
        title={t("needsApproval")}
        subtitle={
          <>
            <span className="truncate">{pendingApproval.toolName}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{t("actionApproval")}</span>
          </>
        }
        state="approval"
      />
      <div className="bg-warning/[0.035] px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="line-clamp-2 text-[11px] text-muted-foreground">
              {summary}
            </p>
            <p className="mt-1 text-xs text-foreground">
              {t("approvalWaiting")}
            </p>
          </div>
          <div className="flex shrink-0 justify-end gap-2">
            <Button
              type={BUTTON_TYPE}
              size="sm"
              variant={OUTLINE_VARIANT}
              className="h-10 rounded-xl px-3 text-xs"
              onClick={() => onReject?.(pendingApproval)}
            >
              <XIcon data-icon="inline-start" aria-hidden="true" />
              {t("reject")}
            </Button>
            <Button
              type={BUTTON_TYPE}
              size="sm"
              className="h-10 rounded-xl px-3 text-xs"
              onClick={() => onApprove?.(pendingApproval)}
            >
              <CheckIcon data-icon="inline-start" aria-hidden="true" />
              {t("approve")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatExpandedToolValue(value: unknown, isOpen: boolean) {
  if (!isOpen || value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

type ToolPartCardProps = {
  part: ChatMessagePart;
  sequence: number;
  messageStatus?: ChatMessage["status"];
  approval?: PendingToolApproval;
  workspaceId?: string;
  workspaceArtifactDisplay?: WorkspaceArtifactDisplay;
  onApprove?: (approval: PendingToolApproval) => void;
  onReject?: (approval: PendingToolApproval) => void;
};

function ToolSequenceBadge({ sequence }: { sequence: number }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/[0.08] font-mono text-[10px] font-medium tabular-nums text-primary">
      {String(sequence).padStart(2, "0")}
    </span>
  );
}

function ToolStatusDot({ state }: { state: ToolVisualState }) {
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

function ToolCardHeader({
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

const ToolPartCard = memo(function ToolPartCard({
  part,
  sequence,
  messageStatus,
  approval,
  workspaceId,
  workspaceArtifactDisplay = "full",
  onApprove,
  onReject,
}: ToolPartCardProps) {
  const t = useTranslations("chat.rendering");
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseToolPart(part.content), [part.content]);
  const agentContext = useMemo(
    () => parseAgentToolDisplayContext(parsed.agentContext),
    [parsed.agentContext],
  );
  const fileArtifact = useMemo(
    () =>
      part.type === "file"
        ? codeWorkspaceArtifactFromPartContent(part.content)
        : null,
    [part.content, part.type],
  );
  const imageAttachment = useMemo(
    () =>
      part.type === "file"
        ? chatImageAttachmentFromPartContent(part.content)
        : null,
    [part.content, part.type],
  );
  const fileAttachment = useMemo(
    () =>
      part.type === "file"
        ? chatFileAttachmentFromPartContent(part.content)
        : null,
    [part.content, part.type],
  );
  const isDelegation = parsed.toolName?.startsWith("delegate_") ?? false;
  const friendlyName = useMemo(
    () => (isDelegation ? t("delegation") : formatToolName(parsed.toolName)),
    [isDelegation, parsed.toolName, t],
  );
  const status = useMemo(() => {
    return resolveToolDisplayStatus(parsed, messageStatus);
  }, [messageStatus, parsed]);
  const hasResult = parsed.output !== undefined;
  const approvalMatches = Boolean(approval);
  const visualState = approvalMatches ? "approval" : status;
  const statusLabel =
    visualState === "approval"
      ? t("actionApproval")
      : visualState === "pending"
        ? t("actionRunning")
        : visualState === "error"
          ? t("actionFailed")
          : t("actionCompleted");
  const displayInput = approvalMatches ? approval?.input : parsed.input;
  const delegationFailure = useMemo(
    () => delegationFailureDetails(parsed.output),
    [parsed.output],
  );

  const inputArtifact = useMemo(
    () => (approvalMatches ? null : htmlArtifactFromToolInput(parsed.input)),
    [approvalMatches, parsed.input],
  );
  const streamingInputArtifact = useMemo(
    () =>
      approvalMatches || parsed.streamingInput
        ? null
        : htmlArtifactFromInputText(parsed.inputText),
    [approvalMatches, parsed.inputText, parsed.streamingInput],
  );
  const sandboxOutput = useMemo(
    () => codeSandboxOutputFromUnknown(parsed.output),
    [parsed.output],
  );
  const sandboxInput = useMemo(
    () => codeSandboxInputFromUnknown(parsed.input),
    [parsed.input],
  );
  const liveSandboxInput = useMemo(
    () =>
      isCodeSandboxToolName(parsed.toolName)
        ? codeSandboxInputFromInputText(parsed.inputText)
        : null,
    [parsed.inputText, parsed.toolName],
  );
  const summaryText = useMemo(() => {
    if (isDelegation && status === "completed") {
      const output = parsed.output;
      const childName =
        typeof output === "object" &&
        output !== null &&
        typeof (output as { childAgentName?: unknown }).childAgentName ===
          "string"
          ? (output as { childAgentName: string }).childAgentName
          : null;
      return childName
        ? t("delegationCompletedBy", { name: childName })
        : t("delegationCompleted");
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
      return reason
        ? t("delegationFailedWithReason", { reason })
        : t("delegationFailed");
    }
    if (status === "error" && (parsed.invalid || parsed.error != null)) {
      return t("actionUnavailable");
    }
    if (status === "pending") {
      return summarizeToolInput(friendlyName, displayInput);
    }
    if (hasResult) {
      return summarizeToolBody(parsed.toolName, parsed.output, false);
    }
    return "";
  }, [
    friendlyName,
    hasResult,
    isDelegation,
    displayInput,
    delegationFailure,
    parsed.error,
    parsed.invalid,
    parsed.output,
    parsed.toolName,
    status,
    t,
  ]);
  const inputText = useMemo(
    () => formatExpandedToolValue(displayInput, open),
    [displayInput, open],
  );
  const outputText = useMemo(
    () => formatExpandedToolValue(parsed.output, open),
    [open, parsed.output],
  );

  let specializedContent: React.ReactNode = null;
  if (fileArtifact) {
    specializedContent =
      workspaceArtifactDisplay === "summary" ? (
        <CodeWorkspaceArtifactSummary artifact={fileArtifact} />
      ) : (
        <CodeWorkspaceArtifactCard
          artifact={fileArtifact}
          workspaceId={workspaceId}
        />
      );
  } else if (imageAttachment) {
    specializedContent = (
      <ChatImageAttachmentCard attachment={imageAttachment} />
    );
  } else if (fileAttachment) {
    specializedContent = <ChatFileAttachmentCard attachment={fileAttachment} />;
  } else if (sandboxOutput) {
    specializedContent = (
      <CodeSandboxResultCard
        result={sandboxOutput}
        input={sandboxInput}
        embedded
      />
    );
  } else if (isHtmlArtifactOutput(parsed.output)) {
    specializedContent = <HtmlArtifactCard artifact={parsed.output} embedded />;
  } else if (isGeneratedImageOutput(parsed.output)) {
    const impact = parsed.output.impact;
    const metrics = [
      impact.cost === null
        ? null
        : `${impact.cost.toFixed(4)} ${impact.currency}`,
      impact.energyKwh === null ? null : `${impact.energyKwh.toFixed(4)} kWh`,
      impact.co2Grams === null ? null : `${impact.co2Grams.toFixed(2)} gCO₂e`,
    ].filter((metric): metric is string => Boolean(metric));
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
    specializedContent =
      workspaceArtifactDisplay === "summary" ? (
        <CodeWorkspaceArtifactSummary artifact={parsed.output} />
      ) : (
        <CodeWorkspaceArtifactCard
          artifact={parsed.output}
          workspaceId={workspaceId}
        />
      );
  } else if (isGitHubPublishOutput(parsed.output)) {
    specializedContent = <GitHubPublishResultCard result={parsed.output} />;
  } else if (inputArtifact) {
    specializedContent = (
      <HtmlArtifactCard artifact={inputArtifact} isLive embedded />
    );
  } else if (parsed.streamingInput && parsed.inputText !== undefined) {
    specializedContent = (
      <LiveToolInputCard
        toolName={friendlyName}
        inputText={parsed.inputText}
        sandboxInput={liveSandboxInput}
        embedded
      />
    );
  } else if (streamingInputArtifact) {
    specializedContent = (
      <HtmlArtifactCard artifact={streamingInputArtifact} isLive embedded />
    );
  }

  if (specializedContent) {
    return (
      <section
        className={cn(
          "w-full overflow-hidden rounded-[15px] border border-border/60 bg-card/75 text-xs shadow-[0_12px_35px_-24px_color-mix(in_oklch,var(--foreground)_35%,transparent)]",
          agentContext &&
            agentContext.depth > 0 &&
            "ml-4 border-l-2 border-l-primary/35 sm:ml-6",
        )}
      >
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
              <span className="truncate">
                {parsed.toolName ?? friendlyName}
              </span>
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

  const detailsOpen =
    open || visualState === "pending" || visualState === "approval";

  return (
    <Collapsible
      open={detailsOpen}
      onOpenChange={setOpen}
      data-open={String(detailsOpen)}
      className={cn(
        "t-acc group/tool relative w-full overflow-hidden rounded-[15px] border border-border/60 bg-card/75 text-xs shadow-[0_12px_35px_-24px_color-mix(in_oklch,var(--foreground)_35%,transparent)] transition-[background-color,border-color,box-shadow] duration-200 ease-out",
        agentContext &&
          agentContext.depth > 0 &&
          "ml-4 border-l-2 border-l-primary/35 sm:ml-6",
        visualState === "approval" && "border-warning/25 bg-warning/[0.025]",
        visualState === "pending" && "border-primary/20 bg-primary/[0.025]",
        visualState === "error" &&
          "border-destructive/25 bg-destructive/[0.02]",
      )}
    >
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
              <Button
                type={BUTTON_TYPE}
                variant={GHOST_VARIANT}
                size="icon-sm"
                className="size-8 shrink-0 rounded-lg text-muted-foreground"
                aria-label={
                  detailsOpen ? t("hideActionDetails") : t("showActionDetails")
                }
              >
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    detailsOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </Button>
            </CollapsibleTrigger>
          ) : null
        }
      />
      {agentContext ? (
        <span className="sr-only" aria-live="polite">
          {status === "pending"
            ? t("agentActionRunning", { name: agentContext.agentName })
            : status === "error"
              ? t("agentActionFailed", { name: agentContext.agentName })
              : t("agentActionCompleted", { name: agentContext.agentName })}
        </span>
      ) : null}
      {approval ? (
        <div className="bg-warning/[0.035] px-3 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground">
              {t("approvalWaiting")}
            </p>
            <div className="flex shrink-0 justify-end gap-1.5">
              <Button
                type={BUTTON_TYPE}
                size="sm"
                variant={OUTLINE_VARIANT}
                className="h-10 rounded-xl px-3 text-[11px]"
                onClick={() => onReject?.(approval)}
              >
                <XIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                {t("reject")}
              </Button>
              <Button
                type={BUTTON_TYPE}
                size="sm"
                className="h-10 rounded-xl px-3 text-[11px]"
                onClick={() => onApprove?.(approval)}
              >
                <CheckIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                {t("approve")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <CollapsibleContent
        forceMount
        className="t-acc-panel"
        aria-hidden={!detailsOpen}
        inert={!detailsOpen ? true : undefined}
      >
        <div className="t-acc-panel-inner">
          <div className="bg-background/25 px-3 py-3">
            {summaryText ? (
              <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
                {summaryText}
              </p>
            ) : null}
            {inputText ? (
              <div className="mb-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {t("actionInput")}
                </div>
                <pre className="max-h-40 overflow-auto rounded-xl bg-muted/25 p-3 leading-4 text-[11px] text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]">
                  {inputText}
                </pre>
              </div>
            ) : null}
            {outputText ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {t("actionOutput")}
                </div>
                <pre className="max-h-60 overflow-auto rounded-xl bg-muted/25 p-3 leading-4 text-[11px] text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]">
                  {outputText}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}, areToolPartCardPropsEqual);

function areToolPartCardPropsEqual(
  previous: Readonly<ToolPartCardProps>,
  next: Readonly<ToolPartCardProps>,
) {
  return (
    previous.part === next.part &&
    previous.sequence === next.sequence &&
    previous.messageStatus === next.messageStatus &&
    previous.approval === next.approval &&
    previous.workspaceId === next.workspaceId &&
    previous.workspaceArtifactDisplay === next.workspaceArtifactDisplay &&
    previous.onApprove === next.onApprove &&
    previous.onReject === next.onReject
  );
}

function SuggestionsPart({
  part,
  onSuggestionClick,
}: {
  part: ChatMessagePart;
  onSuggestionClick?: (suggestion: string) => void;
}) {
  let suggestions: string[] = [];
  try {
    const parsed = JSON.parse(part.content) as unknown;
    if (Array.isArray(parsed)) {
      suggestions = parsed.filter(
        (value): value is string => typeof value === "string",
      );
    }
  } catch {
    return null;
  }
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion}
          type={BUTTON_TYPE}
          variant={OUTLINE_VARIANT}
          size="sm"
          className="h-auto rounded-full px-3 py-1.5 text-xs"
          onClick={() => onSuggestionClick?.(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}

function ThinkingPart({ part }: { part: ChatMessagePart }) {
  const t = useTranslations("chat.rendering");
  const [open, setOpen] = useState(false);
  const content = part.content.trim();
  const isStreaming = part.state === "streaming";
  const hasDetails = reasoningPartHasDetails(part);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-reasoning-details={hasDetails ? "available" : "unavailable"}
      className={cn(
        "group/reasoning overflow-hidden rounded-2xl text-xs transition-[background-color,box-shadow] duration-200 ease-out",
        isStreaming
          ? "bg-primary/[0.055] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_18%,transparent),0_14px_28px_-24px_color-mix(in_oklch,var(--primary)_55%,transparent)]"
          : "bg-muted/25 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_72%,transparent),0_12px_24px_-24px_color-mix(in_oklch,var(--foreground)_30%,transparent)]",
      )}
    >
      <div className="flex min-h-12 items-center gap-2.5 px-2.5 py-1.5">
        <div
          className={cn(
            "relative flex size-8 shrink-0 items-center justify-center rounded-xl bg-background/70 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_60%,transparent)]",
            isStreaming ? "text-primary" : "text-success",
          )}
        >
          <BrainIcon
            className={cn(
              "absolute size-4 transition-[opacity,filter,scale] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)]",
              isStreaming
                ? "scale-100 opacity-100 blur-0"
                : "scale-[0.25] opacity-0 blur-[4px]",
            )}
            aria-hidden="true"
          />
          <CheckCircle2Icon
            className={cn(
              "absolute size-4 transition-[opacity,filter,scale] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)]",
              isStreaming
                ? "scale-[0.25] opacity-0 blur-[4px]"
                : "scale-100 opacity-100 blur-0",
            )}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="font-medium tracking-[-0.01em] text-foreground"
              aria-live="polite"
            >
              {isStreaming ? t("reasoningActive") : t("reasoningComplete")}
            </span>
            {isStreaming ? (
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
        </div>
        {hasDetails ? (
          <CollapsibleTrigger asChild>
            <Button
              type={BUTTON_TYPE}
              variant={GHOST_VARIANT}
              size="sm"
              className="h-10 shrink-0 rounded-xl pl-3 pr-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDownIcon
                className={cn(
                  "size-3 transition-transform duration-200 ease-out",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
              {open ? t("reasoningHide") : t("reasoningView")}
            </Button>
          </CollapsibleTrigger>
        ) : null}
      </div>
      {hasDetails ? (
        <CollapsibleContent>
          {content ? (
            <ChatMarkdown className="border-t border-border/40 bg-background/45 px-4 py-3 text-pretty text-xs leading-5 text-muted-foreground">
              {content}
            </ChatMarkdown>
          ) : isStreaming ? (
            <div className="border-t border-border/40 bg-background/45 px-4 py-3 text-pretty text-xs leading-5 text-muted-foreground">
              {t("reasoningStarting")}
            </div>
          ) : null}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function WorkPhase({
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
  const autoOpen =
    hasPendingApproval ||
    outcome === "pending" ||
    outcome === "interrupted" ||
    (messageStatus === "streaming" && !hasVisibleResponseAfter);
  const open = manualOpen ?? autoOpen;

  const activityLabels = Array.from(
    new Set(
      parts.map(({ part }) => {
        if (part.type === "reasoning") return t("workPhaseReasoning");
        const parsed = parseToolPart(part.content);
        if (parsed.toolName?.startsWith("delegate_")) return t("delegation");
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
  const visibleActivities = activityLabels.slice(0, 3);
  const hiddenActivityCount = activityLabels.length - visibleActivities.length;
  const statusLabel =
    visualState === "approval"
      ? t("actionApproval")
      : visualState === "pending"
        ? t("workPhaseActive")
        : visualState === "error"
          ? t("workPhaseFailed")
          : visualState === "warning"
            ? t("workPhaseCompleteWithIssues")
            : t("workPhaseComplete");

  return (
    <Collapsible
      open={open}
      onOpenChange={setManualOpen}
      data-open={String(open)}
      className={cn(
        "t-acc group/work-phase w-full overflow-hidden rounded-[15px] border border-border/60 bg-card/75 text-xs shadow-[0_12px_35px_-24px_color-mix(in_oklch,var(--foreground)_35%,transparent)] transition-[background-color,border-color,box-shadow] duration-200 ease-out",
        visualState === "approval" && "border-warning/25 bg-warning/[0.025]",
        visualState === "pending" && "border-primary/20 bg-primary/[0.025]",
        visualState === "warning" && "border-warning/25 bg-warning/[0.02]",
        visualState === "error" &&
          "border-destructive/25 bg-destructive/[0.02]",
      )}
    >
      <div className="flex min-h-12 items-center gap-2.5 border-b border-border/45 px-3 py-2">
        <ToolSequenceBadge sequence={sequence} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "shrink-0 font-medium tracking-[-0.01em] text-foreground",
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
          <div className="flex min-w-0 items-center gap-1 overflow-hidden text-[11px] text-muted-foreground">
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
            className="h-10 shrink-0 rounded-xl pl-3 pr-2.5 text-xs text-muted-foreground hover:text-foreground"
            aria-label={open ? t("workPhaseHide") : t("workPhaseView")}
          >
            <span className="t-acc-chevron">
              <ChevronDownIcon className="size-3" aria-hidden="true" />
            </span>
            {open ? t("reasoningHide") : t("reasoningView")}
          </Button>
        </CollapsibleTrigger>
        <ToolStatusDot state={visualState} />
      </div>
      <CollapsibleContent
        forceMount
        className="t-acc-panel"
        aria-hidden={!open}
        inert={!open ? true : undefined}
      >
        <div className="t-acc-panel-inner">
          <div className="space-y-2 bg-background/20 p-2.5">{children}</div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

type MessageContentProps = {
  message: ChatMessage;
  showSuggestions?: boolean;
  workspaceId?: string;
  workspaceArtifactDisplay?: WorkspaceArtifactDisplay;
  isEditing: boolean;
  editingContent: string;
  isSaving: boolean;
  isAnimating: boolean;
  onEditingContentChange?: (content: string) => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  pendingApprovals: PendingToolApproval[];
  onApproveTool?: (approval: PendingToolApproval) => void;
  onRejectTool?: (approval: PendingToolApproval) => void;
  onSuggestionClick?: (suggestion: string) => void;
};

export const MessageContent = memo(function MessageContent({
  message,
  isEditing,
  editingContent,
  isSaving,
  isAnimating,
  onEditingContentChange,
  onCancelEdit,
  onSaveEdit,
  pendingApprovals,
  onApproveTool,
  onRejectTool,
  onSuggestionClick,
  showSuggestions = true,
  workspaceId,
  workspaceArtifactDisplay = "full",
}: MessageContentProps) {
  const content = useMemo(() => textFromMessage(message), [message]);
  const citations = useMemo(() => citationsFromMessage(message), [message]);
  const isAssistant = message.role === "assistant";
  const renderableParts = useMemo(
    () =>
      renderablePartsFromMessage(message).filter(
        (part) =>
          (part.type !== "text" || part.content.trim().length > 0) &&
          !chatTodoListFromToolPart(part),
      ),
    [message],
  );
  const partGroups = useMemo(
    () =>
      groupWorkPhaseParts(renderableParts, {
        isStandalonePart: toolPartHasStandaloneRendering,
      }),
    [renderableParts],
  );
  const stepSequenceByPartIndex = useMemo(() => {
    const sequenceByIndex = new Map<number, number>();
    let sequence = 1;
    renderableParts.forEach((part, partIndex) => {
      if (
        part.type !== "reasoning" &&
        part.type !== "tool-call" &&
        part.type !== "tool-result"
      ) {
        return;
      }
      sequenceByIndex.set(partIndex, sequence);
      sequence += 1;
    });
    return sequenceByIndex;
  }, [renderableParts]);
  const { approvalByPartIndex, standaloneApprovals } = useMemo(() => {
    const approvalByIndex = new Map<number, PendingToolApproval>();
    const matchedApprovalIds = new Set<string>();
    const findUnmatchedApproval = (
      pendingApprovals: PendingToolApproval[],
      part: (typeof renderableParts)[number],
    ): PendingToolApproval | undefined =>
      pendingApprovals.find(
        (item) =>
          !matchedApprovalIds.has(item.invocationId) &&
          toolPartMatchesApproval(part, item),
      );
    if (message.status === "streaming") {
      for (
        let partIndex = renderableParts.length - 1;
        partIndex >= 0;
        partIndex -= 1
      ) {
        const part = renderableParts[partIndex];
        if (part.type !== "tool-call") continue;
        const approval = findUnmatchedApproval(pendingApprovals, part);
        if (!approval) continue;
        approvalByIndex.set(partIndex, approval);
        matchedApprovalIds.add(approval.invocationId);
      }
    }
    return {
      approvalByPartIndex: approvalByIndex,
      standaloneApprovals:
        message.status === "streaming"
          ? pendingApprovals.filter(
              (approval) => !matchedApprovalIds.has(approval.invocationId),
            )
          : [],
    };
  }, [message.status, pendingApprovals, renderableParts]);

  if (isEditing) {
    return (
      <RichEditor
        value={editingContent}
        onChange={onEditingContentChange}
        onSave={onSaveEdit}
        onCancel={onCancelEdit}
        disabled={isSaving}
      />
    );
  }

  if (!isAssistant) {
    const fileParts = renderableParts.filter((part) => part.type === "file");
    if (fileParts.length === 0) return content;
    return (
      <div className="flex flex-col gap-2">
        {content ? <div>{content}</div> : null}
        {fileParts.map((part, partIndex) => {
          const key = `${message.id}-${part.type}-${partIndex}`;
          const imageAttachment = chatImageAttachmentFromPartContent(
            part.content,
          );
          if (imageAttachment) {
            return (
              <ChatImageAttachmentCard key={key} attachment={imageAttachment} />
            );
          }
          const fileAttachment = chatFileAttachmentFromPartContent(
            part.content,
          );
          if (fileAttachment) {
            return (
              <ChatFileAttachmentCard key={key} attachment={fileAttachment} />
            );
          }
          const fileArtifact = codeWorkspaceArtifactFromPartContent(
            part.content,
          );
          if (!fileArtifact) return null;
          return workspaceArtifactDisplay === "summary" ? (
            <CodeWorkspaceArtifactSummary key={key} artifact={fileArtifact} />
          ) : (
            <CodeWorkspaceArtifactCard key={key} artifact={fileArtifact} />
          );
        })}
      </div>
    );
  }

  const renderAssistantPart = (
    part: ChatMessagePart,
    partIndex: number,
  ): React.ReactNode => {
    const key = `${message.id}-${part.type}-${partIndex}`;
    if (part.type === "impact") {
      try {
        const impact = JSON.parse(part.content) as {
          cost: number | null;
          currency: string;
          energyKwh: number | null;
          co2Grams: number | null;
          inputTokens: number;
          outputTokens: number;
        };
        const metrics = [
          impact.cost === null
            ? null
            : `${impact.cost.toFixed(4)} ${impact.currency}`,
          impact.energyKwh === null
            ? null
            : `${impact.energyKwh.toFixed(4)} kWh`,
          impact.co2Grams === null
            ? null
            : `${impact.co2Grams.toFixed(2)} gCO₂e`,
        ].filter((metric): metric is string => Boolean(metric));
        if (metrics.length === 0) return null;
        return (
          <div
            key={key}
            className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground"
          >
            {metrics.map((metric) => (
              <span key={metric} className="rounded-full bg-muted px-2 py-0.5">
                {metric}
              </span>
            ))}
          </div>
        );
      } catch {
        return null;
      }
    }
    if (part.type === "suggestions") {
      if (!showSuggestions) return null;
      return (
        <SuggestionsPart
          key={key}
          part={part}
          onSuggestionClick={onSuggestionClick}
        />
      );
    }
    if (part.type === "reasoning") {
      return <ThinkingPart key={key} part={part} />;
    }
    if (part.type === "error") {
      return <ErrorPart key={key} part={part} />;
    }
    if (part.type === "file") {
      const imageAttachment = chatImageAttachmentFromPartContent(part.content);
      if (imageAttachment) {
        return (
          <ChatImageAttachmentCard key={key} attachment={imageAttachment} />
        );
      }
      const fileAttachment = chatFileAttachmentFromPartContent(part.content);
      if (fileAttachment) {
        return <ChatFileAttachmentCard key={key} attachment={fileAttachment} />;
      }
      const fileArtifact = codeWorkspaceArtifactFromPartContent(part.content);
      if (!fileArtifact) return null;
      return workspaceArtifactDisplay === "summary" ? (
        <CodeWorkspaceArtifactSummary key={key} artifact={fileArtifact} />
      ) : (
        <CodeWorkspaceArtifactCard
          key={key}
          artifact={fileArtifact}
          workspaceId={workspaceId}
        />
      );
    }
    if (part.type === "tool-call" || part.type === "tool-result") {
      return (
        <ToolPartCard
          key={key}
          part={part}
          sequence={stepSequenceByPartIndex.get(partIndex) ?? 1}
          messageStatus={message.status}
          approval={approvalByPartIndex.get(partIndex)}
          workspaceId={workspaceId}
          workspaceArtifactDisplay={workspaceArtifactDisplay}
          onApprove={onApproveTool}
          onReject={onRejectTool}
        />
      );
    }
    return <ChatMarkdown key={key}>{part.content}</ChatMarkdown>;
  };

  return (
    <div className="flex flex-col gap-2">
      {citations.length > 0 ? <CitationBlock citations={citations} /> : null}
      {standaloneApprovals.length > 0
        ? standaloneApprovals.map((approval, approvalIndex) => (
            <PendingApprovalCard
              key={approval.invocationId}
              pendingApproval={approval}
              sequence={approvalIndex + 1}
              onApprove={onApproveTool}
              onReject={onRejectTool}
            />
          ))
        : null}
      {renderableParts.length > 0 ? (
        partGroups.map((group) => {
          if (group.type === "part") {
            return renderAssistantPart(group.part, group.partIndex);
          }
          const firstPartIndex = group.parts[0].partIndex;
          return (
            <WorkPhase
              key={`${message.id}-work-phase-${firstPartIndex}`}
              parts={group.parts}
              sequence={stepSequenceByPartIndex.get(firstPartIndex) ?? 1}
              hasVisibleResponseAfter={group.hasVisibleResponseAfter}
              hasPendingApproval={group.parts.some(({ partIndex }) =>
                approvalByPartIndex.has(partIndex),
              )}
              messageStatus={message.status}
            >
              {group.parts.map(({ part, partIndex }) =>
                renderAssistantPart(part, partIndex),
              )}
            </WorkPhase>
          );
        })
      ) : standaloneApprovals.length === 0 ? (
        content ? (
          <ChatMarkdown>{content}</ChatMarkdown>
        ) : isAnimating ? (
          <StreamingThinking />
        ) : null
      ) : null}
    </div>
  );
}, areMessageContentPropsEqual);

function areMessageContentPropsEqual(
  previous: Readonly<MessageContentProps>,
  next: Readonly<MessageContentProps>,
) {
  return (
    previous.message === next.message &&
    previous.showSuggestions === next.showSuggestions &&
    previous.workspaceId === next.workspaceId &&
    previous.workspaceArtifactDisplay === next.workspaceArtifactDisplay &&
    previous.isEditing === next.isEditing &&
    previous.editingContent === next.editingContent &&
    previous.isSaving === next.isSaving &&
    previous.isAnimating === next.isAnimating &&
    previous.pendingApprovals === next.pendingApprovals
  );
}
