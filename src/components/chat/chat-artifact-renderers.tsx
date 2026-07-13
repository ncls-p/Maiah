"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDownIcon, DownloadIcon, Maximize2Icon } from "lucide-react";

import {
  artifactCombinedCode,
  artifactSourceDocument,
  type CodeSandboxFileOutput,
  type CodeSandboxInputPreview,
  type CodeSandboxOutput,
  type HtmlArtifactOutput,
} from "@/components/chat/chat-message-rendering-utils";
import { Button } from "@/components/ui/button";
import { ToolStateIcon } from "@/components/chat/tool-state-icon";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes } from "@/components/chat/code-workspace-artifact-card";
import { cn } from "@/lib/utils";

const MAX_LIVE_TOOL_INPUT_CHARS = 8000;
const BUTTON_TYPE = "button";
const OUTLINE_VARIANT = "outline";
const GHOST_VARIANT = "ghost";
const COMPACT_ICON_CLASS = "size-3";

function ArtifactCodeBlocks({ artifact }: { artifact: HtmlArtifactOutput }) {
  return (
    <div className="grid gap-2 border-t border-border/50 bg-muted/20 p-3">
      {[
        ["HTML", artifact.html],
        ["CSS", artifact.css],
        ["JavaScript", artifact.js],
      ].map(([label, source]) => (
        <div key={label}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {label}
          </div>
          <pre className="max-h-64 overflow-auto rounded-md border border-border/50 bg-background/80 p-2 font-mono text-[11px] leading-4 text-muted-foreground">
            {source || "// empty"}
          </pre>
        </div>
      ))}
    </div>
  );
}

function LazyArtifactFrame({
  title,
  srcDoc,
  height,
}: {
  title: string;
  srcDoc: string;
  height: number;
}) {
  const t = useTranslations("chat.artifacts");
  const frameRootRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isReady) return;
    const node = frameRootRef.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() => setIsReady(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsReady(true);
        observer.disconnect();
      },
      { rootMargin: "640px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isReady]);

  return (
    <div
      ref={frameRootRef}
      className="flex w-full items-center justify-center bg-white text-xs text-muted-foreground"
      style={{ height }}
    >
      {isReady ? (
        <iframe
          title={title}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-modals"
          loading="lazy"
          className="h-full w-full bg-white"
        />
      ) : (
        <span>{t("previewWhenVisible")}</span>
      )}
    </div>
  );
}

export function HtmlArtifactCard({
  artifact,
  isLive = false,
}: {
  artifact: HtmlArtifactOutput;
  isLive?: boolean;
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
        isLive
          ? "bg-primary/[0.055] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_18%,transparent),0_14px_28px_-24px_color-mix(in_oklch,var(--primary)_55%,transparent)]"
          : "bg-card shadow-[var(--surface-shadow)]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <ToolStateIcon state={isLive ? "pending" : "completed"} />
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
                title={`${artifact.title} fullscreen`}
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

function SandboxOutputFileCard({ file }: { file: CodeSandboxFileOutput }) {
  const t = useTranslations("chat.artifacts");
  const omittedLabel =
    file.contentOmitted === "too_large"
      ? t("fileTooLarge")
      : file.contentOmitted === "total_limit"
        ? t("attachmentLimitReached")
        : null;

  return (
    <div className="rounded-xl bg-background p-2.5 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{file.path}</p>
          <p className="text-[10px] text-muted-foreground">
            {file.mimeType} · {formatBytes(file.size)}
          </p>
        </div>
        {file.downloadUrl ? (
          <Button
            asChild
            variant={OUTLINE_VARIANT}
            size="sm"
            className="h-10 shrink-0 rounded-xl px-3 text-[11px]"
          >
            <a href={file.downloadUrl} target="_blank" rel="noreferrer">
              <DownloadIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
              {t("download")}
            </a>
          </Button>
        ) : null}
      </div>
      {file.downloadError ? (
        <p className="mt-2 text-[11px] text-destructive">
          {file.downloadError}
        </p>
      ) : null}
      {omittedLabel ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{omittedLabel}</p>
      ) : null}
      {file.textPreview ? (
        <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted/30 p-2 whitespace-pre-wrap font-mono text-[10px] leading-4 text-muted-foreground">
          {file.textPreview}
          {file.truncated ? "\n…" : ""}
        </pre>
      ) : null}
    </div>
  );
}

export function CodeSandboxResultCard({
  result,
  input,
}: {
  result: CodeSandboxOutput;
  input?: CodeSandboxInputPreview | null;
}) {
  const t = useTranslations("chat.artifacts");
  const [sourceOpen, setSourceOpen] = useState(false);
  const language = input?.language ?? result.language;
  return (
    <Collapsible
      open={sourceOpen}
      onOpenChange={setSourceOpen}
      data-open={String(sourceOpen)}
      className={cn(
        "t-acc overflow-hidden rounded-2xl text-xs transition-[background-color,box-shadow] duration-200 ease-out",
        result.ok
          ? "bg-card shadow-[var(--surface-shadow)]"
          : "bg-destructive/[0.045] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--destructive)_22%,transparent),0_14px_28px_-24px_color-mix(in_oklch,var(--destructive)_45%,transparent)]",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <ToolStateIcon state={result.ok ? "completed" : "error"} />
          <div className="min-w-0">
            <p className="font-medium text-foreground">{t("codeSandbox")}</p>
            <p className="truncate text-[11px] text-muted-foreground tabular-nums">
              {language} · {result.durationMs}ms ·{" "}
              {result.timedOut
                ? t("timedOut")
                : result.exitCode === null
                  ? t("noExitCode")
                  : t("exitCode", { count: result.exitCode })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {input?.code ? (
            <Button
              type={BUTTON_TYPE}
              variant={GHOST_VARIANT}
              size="sm"
              className="h-10 rounded-xl px-3 text-[11px]"
              onClick={() => setSourceOpen((current) => !current)}
            >
              {t("sourceCode")}
              <span className="t-acc-chevron">
                <ChevronDownIcon
                  className={COMPACT_ICON_CLASS}
                  aria-hidden="true"
                />
              </span>
            </Button>
          ) : null}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              result.ok
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {result.ok ? t("done") : t("failed")}
          </span>
        </div>
      </div>
      <div className="space-y-3 p-3">
        {input?.code ? (
          <CollapsibleContent forceMount className="t-acc-panel">
            <div className="t-acc-panel-inner">
              <div className="space-y-2 rounded-xl bg-muted/20 p-2.5 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>{t("executedCode", { language })}</span>
                  {input.files.length > 0 ? (
                    <span>
                      · {t("inputFiles", { count: input.files.length })}
                    </span>
                  ) : null}
                  {input.attachments.length > 0 ? (
                    <span>
                      · {t("attachments", { count: input.attachments.length })}
                    </span>
                  ) : null}
                </div>
                <pre className="max-h-72 overflow-auto rounded-md bg-background/70 p-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-foreground">
                  {input.code}
                </pre>
              </div>
            </div>
          </CollapsibleContent>
        ) : null}
        {result.stdout ? (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              stdout
            </p>
            <pre className="max-h-40 overflow-auto rounded-md bg-muted/25 p-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-foreground">
              {result.stdout}
            </pre>
          </div>
        ) : null}
        {result.stderr ? (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              stderr
            </p>
            <pre className="max-h-40 overflow-auto rounded-md bg-destructive/5 p-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-destructive">
              {result.stderr}
            </pre>
          </div>
        ) : null}
        {result.files.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("sandboxFiles")}
            </p>
            {result.files.map((file) => (
              <SandboxOutputFileCard key={file.path} file={file} />
            ))}
          </div>
        ) : null}
      </div>
    </Collapsible>
  );
}

export function LiveToolInputCard({
  toolName,
  inputText,
  sandboxInput,
}: {
  toolName: string;
  inputText: string;
  sandboxInput?: CodeSandboxInputPreview | null;
}) {
  const t = useTranslations("chat.artifacts");
  const visibleInputText = useMemo(() => {
    if (inputText.length <= MAX_LIVE_TOOL_INPUT_CHARS) return inputText;
    return `…${inputText.length - MAX_LIVE_TOOL_INPUT_CHARS} earlier characters hidden while streaming\n${inputText.slice(-MAX_LIVE_TOOL_INPUT_CHARS)}`;
  }, [inputText]);
  const visibleCode = useMemo(() => {
    const code = sandboxInput?.code ?? "";
    if (!code) return "";
    if (code.length <= MAX_LIVE_TOOL_INPUT_CHARS) return code;
    return `…${code.length - MAX_LIVE_TOOL_INPUT_CHARS} earlier characters hidden while streaming\n${code.slice(-MAX_LIVE_TOOL_INPUT_CHARS)}`;
  }, [sandboxInput?.code]);
  const displayText = visibleCode || visibleInputText;

  return (
    <div className="overflow-hidden rounded-2xl bg-primary/[0.055] text-xs shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_18%,transparent),0_14px_28px_-24px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
      <div className="flex items-center gap-2.5 border-b border-border/40 px-2.5 py-1.5">
        <ToolStateIcon state="pending" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{toolName}</p>
          <p
            className="t-shimmer truncate text-[11px] text-muted-foreground"
            data-text={
              sandboxInput
                ? t("writingCode", {
                    language: sandboxInput.language ?? "sandbox",
                  })
                : t("writingInput")
            }
          >
            {sandboxInput
              ? t("writingCode", {
                  language: sandboxInput.language ?? "sandbox",
                })
              : t("writingInput")}
          </p>
        </div>
        <span
          className="streaming-thinking__dots mr-2 text-primary"
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </span>
      </div>
      {sandboxInput ? (
        <div className="flex flex-wrap gap-2 border-b border-border/40 px-3 py-2 text-[10px] text-muted-foreground">
          {sandboxInput.files.length > 0 ? (
            <span>{t("inputFiles", { count: sandboxInput.files.length })}</span>
          ) : null}
          {sandboxInput.attachments.length > 0 ? (
            <span>
              {t("attachments", { count: sandboxInput.attachments.length })}
            </span>
          ) : null}
        </div>
      ) : null}
      <pre className="max-h-72 overflow-auto bg-muted/20 p-3 font-mono text-[11px] leading-4 text-muted-foreground whitespace-pre-wrap">
        {displayText || t("waitingInput")}
      </pre>
    </div>
  );
}
