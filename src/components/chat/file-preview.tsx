"use client";

import { code } from "@streamdown/code";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Streamdown } from "streamdown";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyIcon, DownloadIcon } from "lucide-react";

const MARKDOWN_PLUGINS = { code };

interface FilePreviewOptions {
  attachmentId: string;
  canPreview: boolean;
  nativePreview?: boolean;
}

async function requestPreviewText(attachmentId: string) {
  const response = await fetch(
    `/api/workspace/chat-attachments/${attachmentId}/extracted`,
  );
  const data = (await response.json().catch(() => null)) as {
    text?: string;
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load extracted file text");
  }
  return data?.text ?? "";
}

export function useFilePreview(options: FilePreviewOptions) {
  const { attachmentId, canPreview, nativePreview = false } = options;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function loadPreviewText() {
    if (!canPreview || nativePreview || previewText !== null || loadingPreview)
      return;
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      setPreviewText(await requestPreviewText(attachmentId));
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Failed to load extracted file text",
      );
    } finally {
      setLoadingPreview(false);
    }
  }

  function openPreview() {
    setPreviewOpen(true);
    void loadPreviewText();
  }

  function closePreview() {
    setPreviewOpen(false);
  }

  return {
    previewOpen,
    previewText,
    previewError,
    loadingPreview,
    openPreview,
    closePreview,
    setPreviewOpen,
  };
}

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  url: string;
  subtitle: ReactNode;
  previewText: string | null;
  previewError: string | null;
  loadingPreview: boolean;
  mimeType?: string | null;
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  fileName,
  url,
  subtitle,
  previewText,
  previewError,
  loadingPreview,
  mimeType,
}: FilePreviewDialogProps) {
  const t = useTranslations("chat.artifacts");
  const isPdf =
    mimeType?.split(";", 1)[0]?.toLowerCase() === "application/pdf" ||
    fileName.toLowerCase().endsWith(".pdf");
  const isImage =
    mimeType?.split(";", 1)[0]?.toLowerCase().startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(fileName);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-6xl flex-col overflow-hidden sm:max-w-6xl">
        <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">{fileName}</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground">
              {subtitle}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1 pr-8">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              disabled={isPdf || isImage || !previewText}
              onClick={() => {
                if (!previewText) return;
                void navigator.clipboard.writeText(previewText);
              }}
            >
              <CopyIcon className="size-3" aria-hidden="true" />
              {t("copy")}
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
            >
              <a href={url} target="_blank" rel="noreferrer">
                <DownloadIcon className="size-3" aria-hidden="true" />
                {t("download")}
              </a>
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 py-4">
          {isPdf ? (
            <iframe
              src={url}
              title={fileName}
              className="h-[min(68dvh,52rem)] w-full rounded-xl border bg-background"
            />
          ) : isImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={fileName}
                className="mx-auto max-h-[min(80dvh,64rem)] w-auto max-w-full rounded-xl object-contain"
              />
            </>
          ) : loadingPreview ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : previewError ? (
            <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {previewError}
            </p>
          ) : (
            <Streamdown
              mode="static"
              plugins={MARKDOWN_PLUGINS}
              controls={false}
              skipHtml
              disallowedElements={["img"]}
              className="min-h-0 flex-1 rounded-xl border bg-muted/20 p-4 text-sm leading-6 text-foreground"
            >
              {previewText || t("noExtractedText")}
            </Streamdown>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
