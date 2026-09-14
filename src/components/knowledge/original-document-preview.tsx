"use client";
/* eslint-disable @next/next/no-img-element -- Preview the original local blob without image transformation. */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { presentationExtension } from "@/modules/document-extraction/presentation-format";

export function OriginalDocumentPreview({
  open,
  onOpenChange,
  title,
  url,
  mimeType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
  mimeType: string | null;
}) {
  const t = useTranslations("knowledge");
  const [source, setSource] = useState<{
    url: string;
    text?: string;
    pages?: number;
  } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [indexedText, setIndexedText] = useState(false);
  const [slidePage, setSlidePage] = useState(1);
  const isPdf = mimeType === "application/pdf";
  const isPresentation = Boolean(presentationExtension(title, mimeType));
  const isImage = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
  ].includes(mimeType ?? "");
  const isText =
    mimeType?.startsWith("text/") || mimeType === "application/json";
  const native = isPdf || isImage || isText || isPresentation || indexedText;
  const previewUrl = indexedText
    ? url.replace("/raw?", "?")
    : isPresentation
      ? `${url}&preview=slide&page=${slidePage}`
      : url;
  useEffect(() => {
    if (!open || !native) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setSource(null);
        setError(false);
      }
    });
    void fetch(previewUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Original unavailable");
        if (indexedText) {
          const data = await response.json();
          if (controller.signal.aborted) return;
          setSource({
            url: "",
            text: data.document.chunks
              .map((chunk: { content: string }) => chunk.content)
              .join("\n\n"),
          });
          return;
        }
        const blob = await response.blob();
        const text = isText ? await blob.text() : undefined;
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource({
          url: objectUrl,
          text,
          pages:
            Number(response.headers.get("X-Presentation-Pages")) || undefined,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, native, previewUrl, isText, indexedText, attempt]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="break-words">{title}</DialogTitle>
          <DialogDescription>
            {t("originalPreviewDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex gap-1"
            role="group"
            aria-label={t("documentPreviewMode")}
          >
            <Button
              size="sm"
              variant={indexedText ? "ghost" : "secondary"}
              aria-pressed={!indexedText}
              onClick={() => setIndexedText(false)}
            >
              {t("documentOriginal")}
            </Button>
            <Button
              size="sm"
              variant={indexedText ? "secondary" : "ghost"}
              aria-pressed={indexedText}
              onClick={() => setIndexedText(true)}
            >
              {t("documentIndexedText")}
            </Button>
          </div>
          <Button asChild variant="outline">
            <a href={`${url}&download=1`}>
              <DownloadIcon data-icon="inline-start" />
              {t("downloadOriginal")}
            </a>
          </Button>
        </div>
        <div className="min-h-0 overflow-auto">
          {!native ? (
            <div className="grid justify-items-center gap-3 py-12 text-center text-sm text-muted-foreground">
              <FileIcon className="size-10" />
              <p>{t("originalPreviewUnsupported")}</p>
            </div>
          ) : error ? (
            <div role="alert" className="grid gap-3 py-8">
              <p>{t("originalPreviewFailed")}</p>
              <Button
                variant="outline"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t("retry")}
              </Button>
            </div>
          ) : !source ? (
            <div role="status" className="flex justify-center gap-2 py-12">
              <Spinner />
              {t("documentPreviewLoading")}
            </div>
          ) : !indexedText && isPresentation ? (
            <div className="grid gap-3">
              <img
                src={source.url}
                alt={t("slidePosition", {
                  current: slidePage,
                  total: source.pages ?? 1,
                })}
                className="mx-auto max-h-[60svh] max-w-full rounded-xl border object-contain"
              />
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("previousSlide")}
                  disabled={slidePage <= 1}
                  onClick={() => setSlidePage((page) => page - 1)}
                >
                  <ChevronLeftIcon />
                </Button>
                <span className="text-sm tabular-nums" aria-live="polite">
                  {t("slidePosition", {
                    current: slidePage,
                    total: source.pages ?? 1,
                  })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("nextSlide")}
                  disabled={slidePage >= (source.pages ?? 1)}
                  onClick={() => setSlidePage((page) => page + 1)}
                >
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>
          ) : !indexedText && isPdf ? (
            <iframe
              src={source.url}
              title={title}
              className="h-[68svh] w-full rounded-xl border"
            />
          ) : !indexedText && isImage ? (
            <img
              src={source.url}
              alt={title}
              className="mx-auto max-h-[68svh] max-w-full object-contain"
            />
          ) : (
            <pre className="max-h-[68svh] whitespace-pre-wrap break-words rounded-xl border bg-muted/25 p-4 font-mono text-sm">
              {source.text}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
