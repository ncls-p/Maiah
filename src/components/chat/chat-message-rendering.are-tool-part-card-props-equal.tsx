"use client";

import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { reasoningPartHasDetails,type ChatMessagePart } from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import { Collapsible,CollapsibleContent,CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BrainIcon,CheckCircle2Icon,ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BUTTON_TYPE,GHOST_VARIANT,OUTLINE_VARIANT } from "./chat-message-rendering.rich-editor";
import { ToolPartCardProps } from "./chat-message-rendering.tool-part-card-props";

export function areToolPartCardPropsEqual(previous: Readonly<ToolPartCardProps>, next: Readonly<ToolPartCardProps>) {
  return previous.part === next.part && previous.sequence === next.sequence && previous.messageStatus === next.messageStatus && previous.approval === next.approval && previous.workspaceId === next.workspaceId && previous.workspaceArtifactDisplay === next.workspaceArtifactDisplay && previous.onApprove === next.onApprove && previous.onReject === next.onReject;
}

export function SuggestionsPart({ part, onSuggestionClick }: { part: ChatMessagePart; onSuggestionClick?: (suggestion: string) => void }) {
  let suggestions: string[] = [];
  try {
    const parsed = JSON.parse(part.content) as unknown;
    if (Array.isArray(parsed)) {
      suggestions = parsed.filter((value): value is string => typeof value === "string");
    }
  } catch {
    return null;
  }
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <Button key={suggestion} type={BUTTON_TYPE} variant={OUTLINE_VARIANT} size="sm" className="h-auto rounded-full px-3 py-1.5 text-xs" onClick={() => onSuggestionClick?.(suggestion)}>
          {suggestion}
        </Button>
      ))}
    </div>
  );
}

export function ThinkingPart({ part }: { part: ChatMessagePart }) {
  const t = useTranslations("chat.rendering");
  const [open, setOpen] = useState(false);
  const content = part.content.trim();
  const isStreaming = part.state === "streaming";
  const hasDetails = reasoningPartHasDetails(part);

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-reasoning-details={hasDetails ? "available" : "unavailable"} className={cn("group/reasoning overflow-hidden rounded-2xl text-xs transition-[background-color,box-shadow] duration-200 ease-out", isStreaming ? "bg-primary/[0.055] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_18%,transparent),0_14px_28px_-24px_color-mix(in_oklch,var(--primary)_55%,transparent)]" : "bg-muted/25 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_72%,transparent),0_12px_24px_-24px_color-mix(in_oklch,var(--foreground)_30%,transparent)]")}>
      <div className="flex min-h-12 items-center gap-2.5 px-2.5 py-1.5">
        <div className={cn("relative flex size-8 shrink-0 items-center justify-center rounded-xl bg-background/70 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_60%,transparent)]", isStreaming ? "text-primary" : "text-success")}>
          <BrainIcon className={cn("absolute size-4 transition-[opacity,filter,scale] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)]", isStreaming ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]")} aria-hidden="true" />
          <CheckCircle2Icon className={cn("absolute size-4 transition-[opacity,filter,scale] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)]", isStreaming ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0")} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium tracking-[-0.01em] text-foreground" aria-live="polite">
              {isStreaming ? t("reasoningActive") : t("reasoningComplete")}
            </span>
            {isStreaming ? (
              <span className="streaming-thinking__dots text-primary" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            ) : null}
          </div>
        </div>
        {hasDetails ? (
          <CollapsibleTrigger asChild>
            <Button type={BUTTON_TYPE} variant={GHOST_VARIANT} size="sm" className="h-10 shrink-0 rounded-xl pl-3 pr-2.5 text-xs text-muted-foreground hover:text-foreground">
              <ChevronDownIcon className={cn("size-3 transition-transform duration-200 ease-out", open && "rotate-180")} aria-hidden="true" />
              {open ? t("reasoningHide") : t("reasoningView")}
            </Button>
          </CollapsibleTrigger>
        ) : null}
      </div>
      {hasDetails ? <CollapsibleContent>{content ? <ChatMarkdown className="border-t border-border/40 bg-background/45 px-4 py-3 text-pretty text-xs leading-5 text-muted-foreground">{content}</ChatMarkdown> : isStreaming ? <div className="border-t border-border/40 bg-background/45 px-4 py-3 text-pretty text-xs leading-5 text-muted-foreground">{t("reasoningStarting")}</div> : null}</CollapsibleContent> : null}
    </Collapsible>
  );
}
