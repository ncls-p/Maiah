"use client";

import { ChatMarkdown } from "@/components/chat/chat-markdown";
import {
  reasoningPartHasDetails,
  type ChatMessagePart,
} from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsTextClamped } from "@/hooks/use-is-text-clamped";
import { cn } from "@/lib/utils";
import { BrainIcon, CheckCircle2Icon, ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  BUTTON_TYPE,
  GHOST_VARIANT,
  OUTLINE_VARIANT,
} from "./chat-message-rendering.rich-editor";
import { ToolPartCardProps } from "./chat-message-rendering.tool-part-card-props";

export function areToolPartCardPropsEqual(
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

export function SuggestionsPart({
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
        <SuggestionPill
          key={suggestion}
          suggestion={suggestion}
          onSuggestionClick={onSuggestionClick}
        />
      ))}
    </div>
  );
}

function SuggestionPill({
  suggestion,
  onSuggestionClick,
}: {
  suggestion: string;
  onSuggestionClick?: (suggestion: string) => void;
}) {
  const { ref, clamped } = useIsTextClamped<HTMLSpanElement>();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type={BUTTON_TYPE}
          variant={OUTLINE_VARIANT}
          size="sm"
          className="h-auto max-w-full shrink items-start justify-start rounded-xl px-3 py-1.5 text-left text-xs text-pretty whitespace-normal"
          onClick={() => onSuggestionClick?.(suggestion)}
        >
          <span ref={ref} className="line-clamp-2">
            {suggestion}
          </span>
        </Button>
      </TooltipTrigger>
      {clamped ? (
        <TooltipContent side="top" className="max-w-72">
          {suggestion}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}

export function ThinkingPart({ part }: { part: ChatMessagePart }) {
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
        "group/reasoning overflow-hidden rounded-xl text-xs transition-[background-color,box-shadow] duration-150 ease-out",
        isStreaming
          ? "bg-primary/[0.05] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_16%,transparent)]"
          : "bg-muted/20 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_65%,transparent)]",
      )}
    >
      <div className="flex min-h-8 items-center gap-2 px-2 py-1">
        <div
          className={cn(
            "relative flex size-5 shrink-0 items-center justify-center rounded-md bg-background/70 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]",
            isStreaming ? "text-primary" : "text-success",
          )}
        >
          <BrainIcon
            className={cn(
              "absolute size-3 transition-[opacity,filter,scale] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)]",
              isStreaming
                ? "scale-100 opacity-100 blur-0"
                : "scale-[0.25] opacity-0 blur-[4px]",
            )}
            aria-hidden="true"
          />
          <CheckCircle2Icon
            className={cn(
              "absolute size-3 transition-[opacity,filter,scale] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)]",
              isStreaming
                ? "scale-[0.25] opacity-0 blur-[4px]"
                : "scale-100 opacity-100 blur-0",
            )}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold leading-4 tracking-[-0.01em] text-foreground"
            aria-live="polite"
          >
            <span className="truncate">
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
          </p>
          <p className="truncate text-[10px] leading-4 text-muted-foreground">
            {isStreaming ? t("actionRunning") : t("actionCompleted")}
          </p>
        </div>
        {hasDetails ? (
          <CollapsibleTrigger asChild>
            <Button
              type={BUTTON_TYPE}
              variant={GHOST_VARIANT}
              size="icon-sm"
              className="size-6 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
              aria-label={open ? t("reasoningHide") : t("reasoningView")}
            >
              <ChevronDownIcon
                className={cn(
                  "size-3 transition-transform duration-150 ease-out",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
        ) : null}
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full border-2 border-current",
            isStreaming
              ? "animate-spin border-r-transparent text-primary motion-reduce:animate-pulse"
              : "bg-success text-success",
          )}
          aria-hidden="true"
        />
      </div>
      {hasDetails ? (
        <CollapsibleContent>
          {content ? (
            <ChatMarkdown
              isAnimating={isStreaming}
              className="border-t border-border/35 bg-background/35 px-2.5 py-2 text-pretty text-[11px] leading-4 text-muted-foreground"
            >
              {content}
            </ChatMarkdown>
          ) : isStreaming ? (
            <div className="border-t border-border/35 bg-background/35 px-2.5 py-2 text-pretty text-[11px] leading-4 text-muted-foreground">
              {t("reasoningStarting")}
            </div>
          ) : null}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
