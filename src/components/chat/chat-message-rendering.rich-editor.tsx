"use client";

import {
formatToolName
} from "@/components/chat/chat-message-rendering-utils";
import {
type ChatMessagePart,
type PendingToolApproval
} from "@/components/chat/chat-types";
import type { RichEditorProps } from "@/components/chat/rich-editor";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
import { Button } from "@/components/ui/button";
import {
Collapsible,
CollapsibleContent,
CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
AlertTriangleIcon,
CheckIcon,
ChevronDownIcon,
CopyIcon,
XIcon
} from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ToolCardHeader } from "./chat-message-rendering.tool-part-card-props";


export const RichEditor = dynamic<RichEditorProps>(
  () => import("@/components/chat/rich-editor").then((mod) => mod.RichEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-32 w-full rounded-xl" />,
  },
);

export const BUTTON_TYPE = "button";
export const OUTLINE_VARIANT = "outline";
export const GHOST_VARIANT = "ghost";
export const COMPACT_ICON_CLASS = "size-3";

export function StreamingThinking() {
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

export function ErrorPart({ part }: { part: ChatMessagePart }) {
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

export function PendingApprovalCard({
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

export function formatExpandedToolValue(value: unknown, isOpen: boolean) {
  if (!isOpen || value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
