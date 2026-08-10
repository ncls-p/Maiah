"use client";

import {
  ChevronDownIcon,
  ExternalLinkIcon,
  FileTextIcon,
  Loader2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import type { ChatCitation } from "@/components/chat/chat-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export interface CitationBlockProps {
  citations: ChatCitation[];
  workspaceId?: string;
  className?: string;
}

type KnowledgeDocument = {
  documentId: string;
  documentTitle: string;
  mimeType: string | null;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  chunks: Array<{ chunkId: string; chunkIndex: number; content: string }>;
};

export function CitationItem({
  citation,
  index,
  workspaceId,
}: {
  citation: ChatCitation;
  index: number;
  workspaceId?: string;
}) {
  const t = useTranslations("chat.citations");
  const [open, setOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [document, setDocument] = useState<KnowledgeDocument | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const citedChunkRef = useRef<HTMLElement | null>(null);
  const relevance = Math.min(
    100,
    Math.max(0, Number.isFinite(citation.score) ? citation.score * 100 : 0),
  );
  const canOpenDocument = Boolean(
    workspaceId && citation.knowledgeBaseId && citation.documentId,
  );

  useEffect(() => {
    if (!documentOpen || loadingDocument || !document) return;
    citedChunkRef.current?.scrollIntoView({ block: "center" });
  }, [document, documentOpen, loadingDocument]);

  async function openFullDocument() {
    if (!workspaceId || !citation.knowledgeBaseId) return;
    setDocumentOpen(true);
    if (document || loadingDocument) return;
    setLoadingDocument(true);
    setDocumentError(null);
    try {
      const payload = await fetchJson<{ document: KnowledgeDocument }>(
        `/api/workspace/knowledge-bases/${citation.knowledgeBaseId}/documents/${citation.documentId}?workspaceId=${workspaceId}`,
      );
      setDocument(payload.document);
    } catch (error) {
      setDocumentError(
        error instanceof Error ? error.message : t("documentLoadFailed"),
      );
    } finally {
      setLoadingDocument(false);
    }
  }

  return (
    <li>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-11 w-full justify-start rounded-xl px-3 py-2.5 text-left transition-[background-color,box-shadow,scale] duration-200 ease-out hover:bg-background/75 active:scale-[0.96]"
            aria-label={
              open
                ? t("hideExcerpt", { title: citation.documentTitle })
                : t("showExcerpt", { title: citation.documentTitle })
            }
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]">
              <FileTextIcon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-semibold text-foreground">
                  {citation.documentTitle}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/60">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </span>
              {citation.knowledgeBaseName ? (
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {citation.knowledgeBaseName}
                </span>
              ) : null}
            </span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-3">
          <div className="rounded-xl bg-background/70 px-3 py-2.5 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_45%,transparent)]">
            <div className="mb-2 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
              <span>{t("excerpt")}</span>
              <span className="font-mono tabular-nums">
                {t("relevance", { value: Math.round(relevance) })}
              </span>
            </div>
            <p className="text-pretty text-xs leading-5 text-muted-foreground">
              {citation.content}
            </p>
            {canOpenDocument ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 min-h-10 w-full gap-2 rounded-xl text-xs transition-[background-color,border-color,scale] active:scale-[0.98] sm:w-auto"
                onClick={() => void openFullDocument()}
              >
                <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
                {t("viewFullDocument")}
              </Button>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Dialog open={documentOpen} onOpenChange={setDocumentOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] max-w-4xl flex-col overflow-hidden p-0 sm:max-h-[88dvh]">
          <DialogHeader className="border-b border-border/60 px-5 py-4 pr-12 text-left">
            <DialogTitle className="truncate text-base">
              {citation.documentTitle}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>{citation.knowledgeBaseName ?? t("fullDocument")}</span>
              {document ? (
                <span>{t("chunks", { count: document.chunks.length })}</span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/15 px-3 py-3 sm:px-5 sm:py-4">
            {loadingDocument ? (
              <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
                {t("loadingDocument")}
              </div>
            ) : documentError ? (
              <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                {documentError}
              </p>
            ) : document ? (
              <article className="mx-auto max-w-3xl space-y-2">
                {document.chunks.map((chunk) => {
                  const cited = chunk.chunkId === citation.chunkId;
                  const citationStart = cited
                    ? chunk.content.indexOf(citation.content)
                    : -1;
                  return (
                    <section
                      key={chunk.chunkId}
                      ref={cited ? citedChunkRef : undefined}
                      className={cn(
                        "rounded-xl border bg-background px-4 py-3 shadow-sm",
                        cited &&
                          "border-primary/35 bg-primary/[0.07] ring-2 ring-primary/12",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono tabular-nums">
                          {t("chunk", { count: chunk.chunkIndex + 1 })}
                        </span>
                        {cited ? (
                          <Badge className="rounded-full bg-primary/12 text-[10px] text-primary hover:bg-primary/12">
                            {t("citedPassage")}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {cited ? (
                          citationStart >= 0 ? (
                            <>
                              {chunk.content.slice(0, citationStart)}
                              <mark className="rounded bg-warning/20 px-0.5 text-inherit ring-1 ring-warning/30">
                                {citation.content}
                              </mark>
                              {chunk.content.slice(
                                citationStart + citation.content.length,
                              )}
                            </>
                          ) : (
                            <mark className="rounded bg-warning/20 px-0.5 text-inherit ring-1 ring-warning/30">
                              {chunk.content}
                            </mark>
                          )
                        ) : (
                          chunk.content
                        )}
                      </p>
                    </section>
                  );
                })}
              </article>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
