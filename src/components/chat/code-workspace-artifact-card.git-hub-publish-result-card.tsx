"use client";

import { DownloadIcon, FileIcon, Maximize2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ChatFileAttachment } from "@/components/chat/chat-types";
import {
  FilePreviewDialog,
  useFilePreview,
} from "@/components/chat/file-preview";
import { ToolStateIcon } from "@/components/chat/tool-state-icon";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import {
  GithubIcon,
  formatBytes,
} from "./code-workspace-artifact-card.button-type";
import { GitHubPublishOutput } from "./code-workspace-artifact-card.code-workspace-file-tree";

export function GitHubPublishResultCard({
  result,
}: {
  result: GitHubPublishOutput;
}) {
  const t = useTranslations("chat.artifacts");
  return (
    <div className="w-fit max-w-full overflow-hidden rounded-2xl bg-card text-xs shadow-[var(--surface-shadow)]">
      <div className="flex min-h-12 items-center gap-2.5 border-b border-border/40 px-2.5 py-1.5">
        <ToolStateIcon state="completed" />
        <GithubIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-medium text-foreground">{result.message}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {result.repository} ·{" "}
            {result.mode === "pull_request" ? "PR" : t("directPush")} ·{" "}
            {result.targetBranch}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
        <span>{t("commit", { sha: result.commitSha.slice(0, 7) })}</span>
        {result.pullRequestUrl ? (
          <a
            href={result.pullRequestUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            {t("openPr")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function ChatFileAttachmentCard({
  attachment,
}: {
  attachment: ChatFileAttachment;
}) {
  const t = useTranslations("chat.artifacts");
  const tComposer = useTranslations("chat.composer");
  const isPdf =
    attachment.mimeType === "application/pdf" ||
    attachment.fileName.toLowerCase().endsWith(".pdf");
  const canPreview = isPdf || attachment.extractedTextChars > 0;
  const readLabel =
    attachment.extractionStatus === "unreadable"
      ? tComposer("storedSafely", { size: formatBytes(attachment.size) })
      : attachment.extractionStatus === "truncated"
        ? tComposer("partiallyRead")
        : tComposer("readable");
  const fileSummary = `${readLabel}${attachment.extractionStatus === "unreadable" ? "" : ` · ${formatBytes(attachment.size)}`}`;
  const preview = useFilePreview({
    attachmentId: attachment.id,
    canPreview,
    nativePreview: isPdf,
  });

  return (
    <>
      <Attachment className="max-w-[min(28rem,84vw)]">
        <AttachmentMedia>
          <FileIcon aria-hidden="true" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
          <AttachmentDescription>
            {fileSummary}
            {attachment.extractedTextChars > 0
              ? ` · ${t("extractedChars", { count: attachment.extractedTextChars })}`
              : ""}
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          {canPreview ? (
            <AttachmentAction
              type="button"
              variant="outline"
              size="sm"
              onClick={preview.openPreview}
            >
              <Maximize2Icon data-icon="inline-start" aria-hidden="true" />
              {t("view")}
            </AttachmentAction>
          ) : null}
          <AttachmentAction asChild variant="ghost" size="sm">
            <a href={attachment.url} target="_blank" rel="noreferrer">
              <DownloadIcon data-icon="inline-start" aria-hidden="true" />
              {t("download")}
            </a>
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <FilePreviewDialog
        open={preview.previewOpen}
        onOpenChange={preview.setPreviewOpen}
        fileName={attachment.fileName}
        url={attachment.url}
        mimeType={attachment.mimeType}
        subtitle={
          `${fileSummary} · ` +
          t("extractedChars", { count: attachment.extractedTextChars })
        }
        previewText={preview.previewText}
        previewError={preview.previewError}
        loadingPreview={preview.loadingPreview}
      />
    </>
  );
}
