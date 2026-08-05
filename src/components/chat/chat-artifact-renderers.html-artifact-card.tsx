"use client";

import { Maximize2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo,useState } from "react";
import { toast } from "sonner";

import {
artifactCombinedCode,
artifactSourceDocument,
type HtmlArtifactOutput
} from "@/components/chat/chat-message-rendering-utils";
import { ToolStateIcon } from "@/components/chat/tool-state-icon";
import { Button } from "@/components/ui/button";
import {
Collapsible,
CollapsibleContent
} from "@/components/ui/collapsible";
import {
Dialog,
DialogContent,
DialogDescription,
DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ArtifactCodeBlocks,BUTTON_TYPE,COMPACT_ICON_CLASS,GHOST_VARIANT,LazyArtifactFrame,OUTLINE_VARIANT } from "./chat-artifact-renderers.max-live-tool-input-chars";


export function HtmlArtifactCard({
  artifact,
  isLive = false,
  embedded = false,
}: {
  artifact: HtmlArtifactOutput;
  isLive?: boolean;
  embedded?: boolean;
}) {
  const t = useTranslations("chat.artifacts");
  const [codeOpen, setCodeOpen] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenCodeOpen, setFullscreenCodeOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeText = useMemo(() => artifactCombinedCode(artifact), [artifact]);
  const srcDoc = useMemo(() => artifactSourceDocument(artifact), [artifact]);
  const fullscreenSrcDoc = useMemo(
    () => artifactSourceDocument(artifact, { fullscreen: true }),
    [artifact],
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl text-xs transition-[background-color,box-shadow] duration-200 ease-out",
        embedded
          ? "rounded-xl border border-border/55 bg-background/45"
          : isLive
            ? "bg-primary/[0.055] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_18%,transparent),0_14px_28px_-24px_color-mix(in_oklch,var(--primary)_55%,transparent)]"
            : "bg-card shadow-[var(--surface-shadow)]",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-2.5 py-1.5",
          embedded && "min-h-10 bg-muted/20",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {embedded ? (
            <span className="flex items-center gap-1" aria-hidden="true">
              <i className="size-1.5 rounded-full bg-muted-foreground/35" />
              <i className="size-1.5 rounded-full bg-muted-foreground/35" />
              <i className="size-1.5 rounded-full bg-muted-foreground/35" />
            </span>
          ) : (
            <ToolStateIcon state={isLive ? "pending" : "completed"} />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {artifact.title}
            </p>
            <p
              className={cn(
                "text-[11px] text-muted-foreground",
                isLive && "t-shimmer",
              )}
              data-text={isLive ? t("livePreviewDescription") : undefined}
            >
              {isLive
                ? t("livePreviewDescription")
                : t("interactivePreviewDescription")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type={BUTTON_TYPE}
            variant={GHOST_VARIANT}
            size="sm"
            className="h-10 rounded-xl px-3 text-[11px]"
            onClick={() => setFullscreenOpen(true)}
          >
            <Maximize2Icon className={COMPACT_ICON_CLASS} aria-hidden="true" />
            {t("fullscreen")}
          </Button>
          <Button
            type={BUTTON_TYPE}
            variant={OUTLINE_VARIANT}
            size="sm"
            className="h-10 rounded-xl px-3 text-[11px]"
            onClick={copyCode}
          >
            {copied ? t("copied") : t("copyCode")}
          </Button>
          <Button
            type={BUTTON_TYPE}
            variant={GHOST_VARIANT}
            size="sm"
            className="h-10 rounded-xl px-3 text-[11px]"
            onClick={() => setCodeOpen((current) => !current)}
          >
            {codeOpen ? t("hideCode") : t("viewCode")}
          </Button>
        </div>
      </div>
      <LazyArtifactFrame
        title={artifact.title}
        srcDoc={srcDoc}
        height={artifact.height}
      />
      <Collapsible
        open={codeOpen}
        onOpenChange={setCodeOpen}
        data-open={String(codeOpen)}
        className="t-acc"
      >
        <CollapsibleContent forceMount className="t-acc-panel">
          <div className="t-acc-panel-inner">
            <ArtifactCodeBlocks artifact={artifact} />
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent className="!fixed !inset-0 flex !h-dvh !w-full !translate-x-0 !translate-y-0 flex-col overflow-hidden !rounded-none !border-0 bg-background p-0 sm:!max-w-none">
          <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold">
                {artifact.title}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                {t("fullscreenPreviewDescription")}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type={BUTTON_TYPE}
                variant={OUTLINE_VARIANT}
                size="sm"
                className="h-10 rounded-xl px-3 text-xs"
                onClick={copyCode}
              >
                {copied ? t("copied") : t("copyCode")}
              </Button>
              <Button
                type={BUTTON_TYPE}
                variant={GHOST_VARIANT}
                size="sm"
                className="h-10 rounded-xl px-3 text-xs"
                onClick={() => setFullscreenCodeOpen((current) => !current)}
              >
                {fullscreenCodeOpen ? t("hideCode") : t("viewCode")}
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 bg-muted/30 p-4 sm:p-6 lg:flex-row">
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-white shadow-2xl shadow-black/10 ring-1 ring-black/5 lg:min-w-0">
              <iframe
                title={t("fullscreenTitle", { name: artifact.title })}
                srcDoc={fullscreenSrcDoc}
                sandbox="allow-scripts allow-modals"
                className="h-full w-full bg-white"
              />
            </div>
            <Collapsible
              open={fullscreenCodeOpen}
              onOpenChange={setFullscreenCodeOpen}
            >
              <CollapsibleContent className="flex max-h-[45%] flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-xl lg:max-h-none lg:min-w-[22rem] lg:max-w-[32rem]">
                <div className="flex-1 overflow-auto">
                  <ArtifactCodeBlocks artifact={artifact} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
