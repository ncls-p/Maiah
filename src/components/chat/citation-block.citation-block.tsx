"use client";

import {
BookOpenIcon,
ChevronDownIcon
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
Collapsible,
CollapsibleContent,
CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { CitationBlockProps,CitationItem } from "./citation-block.citation-block-props";


export function CitationBlock({
  citations,
  workspaceId,
  className,
}: CitationBlockProps) {
  const t = useTranslations("chat.citations");
  const [open, setOpen] = useState(false);
  if (citations.length === 0) return null;

  const documentCount = new Set(
    citations.map((citation) => citation.documentId),
  ).size;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "group/citations overflow-hidden rounded-2xl bg-muted/25 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_60%,transparent),0_10px_30px_-26px_color-mix(in_oklch,var(--foreground)_30%,transparent)] transition-[background-color,box-shadow] duration-200 ease-out",
        open && "bg-muted/35",
        className,
      )}
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-12 w-full justify-start rounded-2xl px-3 text-left transition-[background-color,scale] duration-200 ease-out hover:bg-background/35 active:scale-[0.96]"
          aria-label={open ? t("hideSources") : t("showSources")}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-background text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_60%,transparent)]">
            <BookOpenIcon className="size-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-foreground">
              {t("title")}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {t("documents", { count: documentCount })}
            </span>
          </span>
          <Badge
            variant="secondary"
            className="h-5 rounded-full px-2 font-mono text-[10px] font-medium tabular-nums"
          >
            {citations.length}
          </Badge>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ul className="space-y-1 px-2 pb-2">
          {citations.map((citation, index) => (
            <CitationItem
              key={`${citation.chunkId}-${index}`}
              citation={citation}
              index={index}
              workspaceId={workspaceId}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
