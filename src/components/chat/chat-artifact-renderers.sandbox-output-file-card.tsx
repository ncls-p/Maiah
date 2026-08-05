"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDownIcon, DownloadIcon, Maximize2Icon } from "lucide-react";

import {
  artifactCombinedCode,
  artifactSourceDocument,
  partitionCodeSandboxFiles,
  type CodeSandboxFileOutput,
  type CodeSandboxInputPreview,
  type CodeSandboxOutput,
  type HtmlArtifactOutput,
} from "@/components/chat/chat-message-rendering-utils";
import { Button } from "@/components/ui/button";
import { ToolStateIcon } from "@/components/chat/tool-state-icon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes } from "@/components/chat/code-workspace-artifact-card";
import { cn } from "@/lib/utils";
import { COMPACT_ICON_CLASS, OUTLINE_VARIANT } from "./chat-artifact-renderers.max-live-tool-input-chars";


export function SandboxOutputFileCard({ file }: { file: CodeSandboxFileOutput }) {
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
