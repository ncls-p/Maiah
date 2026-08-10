"use client";

import { DownloadIcon, Maximize2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { type CodeSandboxFileOutput } from "@/components/chat/chat-message-rendering-utils";
import { formatBytes } from "@/components/chat/code-workspace-artifact-card";
import { Button } from "@/components/ui/button";
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { OUTLINE_VARIANT } from "./chat-artifact-renderers.max-live-tool-input-chars";

export function SandboxOutputFileCard({ file }: { file: CodeSandboxFileOutput }) {
  const t = useTranslations("chat.artifacts");
  const omittedLabel = file.contentOmitted === "too_large" ? t("fileTooLarge") : file.contentOmitted === "total_limit" ? t("attachmentLimitReached") : null;
  const [previewOpen, setPreviewOpen] = useState(false);
  const isPdf = file.mimeType === "application/pdf" || file.path.toLowerCase().endsWith(".pdf");

  return (
    <>
      <div className="rounded-xl bg-background p-2.5 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{file.path}</p>
            <p className="text-[10px] text-muted-foreground">
              {file.mimeType} · {formatBytes(file.size)}
            </p>
          </div>
          {file.downloadUrl ? (
            <div className="flex items-center gap-1">
              {isPdf ? (
                <Button type="button" variant={OUTLINE_VARIANT} size="sm" className="h-10 shrink-0 rounded-xl px-3 text-[11px]" onClick={() => setPreviewOpen(true)}>
                  <Maximize2Icon data-icon="inline-start" aria-hidden="true" />
                  {t("view")}
                </Button>
              ) : null}
              <Button asChild variant={OUTLINE_VARIANT} size="sm" className="h-10 shrink-0 rounded-xl px-3 text-[11px]">
                <a href={file.downloadUrl} target="_blank" rel="noreferrer">
                  <DownloadIcon data-icon="inline-start" aria-hidden="true" />
                  {t("download")}
                </a>
              </Button>
            </div>
          ) : null}
        </div>
        {file.downloadError ? <p className="mt-2 text-[11px] text-destructive">{file.downloadError}</p> : null}
        {omittedLabel ? <p className="mt-2 text-[11px] text-muted-foreground">{omittedLabel}</p> : null}
        {file.textPreview ? (
          <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted/30 p-2 whitespace-pre-wrap font-mono text-[10px] leading-4 text-muted-foreground">
            {file.textPreview}
            {file.truncated ? "\n…" : ""}
          </pre>
        ) : null}
      </div>
      {file.downloadUrl && isPdf ? <FilePreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} fileName={file.path} url={file.downloadUrl} mimeType="application/pdf" subtitle={`${file.mimeType} · ${formatBytes(file.size)}`} previewText={null} previewError={null} loadingPreview={false} /> : null}
    </>
  );
}
