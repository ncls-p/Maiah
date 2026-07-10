"use client";

import { Link } from "@/i18n/navigation";
import {
  FileIcon,
  Loader2Icon,
  Maximize2Icon,
  PaperclipIcon,
  SendIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  useFilePreview,
  FilePreviewDialog,
} from "@/components/chat/file-preview";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatAttachment } from "@/components/chat/chat-types";
import { cn } from "@/lib/utils";

export interface QueuedChatMessage {
  id: string;
  content: string;
}

interface ChatComposerProps {
  input: string;
  canChat: boolean;
  sending: boolean;
  queuedMessages?: QueuedChatMessage[];
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onQueuedMessageChange?: (id: string, content: string) => void;
  onQueuedMessageCancel?: (id: string) => void;
  onUploadCodeWorkspace?: (files: File[]) => Promise<void>;
  onUploadChatAttachment?: (file: File) => Promise<void>;
  attachments?: ChatAttachment[];
  onRemoveAttachment?: (attachmentId: string) => void;
}

const maxChatAttachments = 8;
const codeFilePattern = /\.(?:html?|css|[cm]?js)$/i;

function uploadedFilePath(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  return relativePath?.trim() || file.name;
}

function isDirectCodeFile(file: File) {
  return codeFilePattern.test(uploadedFilePath(file));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function pastedFileName(file: File, index: number) {
  if (file.name.trim()) return file;
  const extension =
    file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const safeExtension = extension?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return new File(
    [file],
    `pasted-image-${index + 1}.${safeExtension || "png"}`,
    {
      type: file.type || "image/png",
      lastModified: file.lastModified,
    },
  );
}

function filesFromClipboard(data: DataTransfer) {
  const files = Array.from(data.files);
  if (files.length > 0) return files.map(pastedFileName);
  return Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .map(pastedFileName);
}

function attachmentSubtitle(
  attachment: ChatAttachment,
  locale: string,
  t: ReturnType<typeof useTranslations<"chat.composer">>,
) {
  if (attachment.kind === "chat_image") {
    return `${attachment.mimeType.replace("image/", "").toUpperCase()} · ${formatBytes(attachment.size)}`;
  }
  if (attachment.extractionStatus === "unreadable") {
    return t("storedSafely", { size: formatBytes(attachment.size) });
  }
  const readLabel =
    attachment.extractionStatus === "truncated"
      ? t("partiallyRead")
      : t("readable");
  return t("fileSummary", {
    status: readLabel,
    count: attachment.extractedTextChars.toLocaleString(locale),
    size: formatBytes(attachment.size),
  });
}

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachment;
  onRemove?: (attachmentId: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("chat.composer");
  const subtitle = attachmentSubtitle(attachment, locale, t);
  const canPreview =
    attachment.kind === "chat_file" && attachment.extractedTextChars > 0;
  const preview = useFilePreview({
    attachmentId: attachment.id,
    canPreview,
  });

  if (attachment.kind === "chat_image") {
    return (
      <Attachment orientation="vertical" className="w-24">
        <AttachmentMedia
          variant="image"
          role="img"
          aria-label={attachment.fileName}
          style={{
            backgroundImage: `url("${attachment.url.replace(/"/g, '\\"')}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <AttachmentContent>
          <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
          <AttachmentDescription>{subtitle}</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction
            type="button"
            variant="secondary"
            className="size-10 rounded-xl"
            aria-label={t("removeFile", { name: attachment.fileName })}
            onClick={() => onRemove?.(attachment.id)}
          >
            <XIcon aria-hidden="true" />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
    );
  }

  return (
    <>
      <Attachment className="w-72 max-w-full">
        <AttachmentMedia>
          <FileIcon aria-hidden="true" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
          <AttachmentDescription>{subtitle}</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          {canPreview ? (
            <AttachmentAction
              type="button"
              className="size-10 rounded-xl"
              aria-label={t("viewExtractedText", { name: attachment.fileName })}
              onClick={preview.openPreview}
            >
              <Maximize2Icon aria-hidden="true" />
            </AttachmentAction>
          ) : null}
          <AttachmentAction
            type="button"
            className="size-10 rounded-xl"
            aria-label={t("removeFile", { name: attachment.fileName })}
            onClick={() => onRemove?.(attachment.id)}
          >
            <XIcon aria-hidden="true" />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <FilePreviewDialog
        open={preview.previewOpen}
        onOpenChange={preview.setPreviewOpen}
        fileName={attachment.fileName}
        url={attachment.url}
        subtitle={subtitle}
        previewText={preview.previewText}
        previewError={preview.previewError}
        loadingPreview={preview.loadingPreview}
      />
    </>
  );
}

export function ChatComposer({
  input,
  canChat,
  sending,
  queuedMessages = [],
  onSubmit,
  onInputChange,
  onStop,
  onQueuedMessageChange,
  onQueuedMessageCancel,
  onUploadCodeWorkspace,
  onUploadChatAttachment,
  attachments = [],
  onRemoveAttachment,
}: ChatComposerProps) {
  const t = useTranslations("chat.composer");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${newHeight}px`;
  }, [input]);

  async function handleSelectedFiles(files: File[]) {
    const uploadedFiles = files.filter(Boolean);
    if (uploadedFiles.length === 0) return;
    if (!canChat) return;
    if (sending) {
      toast.error(t("waitForResponse"));
      return;
    }
    setUploadingAttachment(true);
    try {
      const zipFiles = uploadedFiles.filter((file) =>
        file.name.toLowerCase().endsWith(".zip"),
      );
      const codeFiles = uploadedFiles.filter(isDirectCodeFile);
      if (zipFiles.length > 0) {
        if (uploadedFiles.length > 1) {
          toast.error(t("singleZip"));
          return;
        }
        await onUploadCodeWorkspace?.(zipFiles);
        return;
      }
      if (
        codeFiles.length === uploadedFiles.length &&
        codeFiles.some((file) => /\.html?$/i.test(uploadedFilePath(file)))
      ) {
        await onUploadCodeWorkspace?.(codeFiles);
        return;
      }
      if (!onUploadChatAttachment) {
        toast.error(t("unavailable"));
        return;
      }
      if (attachments.length + uploadedFiles.length > maxChatAttachments) {
        toast.error(t("limit", { count: maxChatAttachments }));
        return;
      }
      for (const file of uploadedFiles) {
        await onUploadChatAttachment(file);
      }
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await handleSelectedFiles(files);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = filesFromClipboard(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    void handleSelectedFiles(files);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="w-full min-w-0 shrink-0 bg-transparent px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-3"
    >
      {queuedMessages.length > 0 ? (
        <div className="mx-auto mb-2 flex w-full max-w-4xl flex-col gap-2">
          {queuedMessages.map((message, index) => (
            <div
              key={message.id}
              className="rounded-2xl border border-border/60 bg-card p-2.5"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t("queuedMessage", { count: index + 1 })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 rounded-xl text-muted-foreground hover:text-foreground"
                  aria-label={t("cancelQueued")}
                  onClick={() => onQueuedMessageCancel?.(message.id)}
                >
                  <XIcon className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
              <Textarea
                aria-label={t("queuedMessage", { count: index + 1 })}
                value={message.content}
                onChange={(event) =>
                  onQueuedMessageChange?.(message.id, event.target.value)
                }
                rows={1}
                className="max-h-28 min-h-10 resize-none text-sm shadow-none"
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="relative mx-auto w-full min-w-0 max-w-4xl">
        {attachments.length > 0 ? (
          <AttachmentGroup className="mb-2">
            {attachments.map((attachment) => (
              <AttachmentPreview
                key={attachment.id}
                attachment={attachment}
                onRemove={onRemoveAttachment}
              />
            ))}
          </AttachmentGroup>
        ) : null}
        <div className={cn("composer-box rounded-2xl")}>
          <div className="flex items-end gap-1 p-1.5 sm:gap-1.5 sm:p-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(event) => void handleFileChange(event)}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-10 shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("uploadFiles")}
              disabled={uploadingAttachment || sending || !canChat}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingAttachment ? (
                <Loader2Icon
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <PaperclipIcon className="size-4" aria-hidden="true" />
              )}
            </Button>

            <Textarea
              ref={textareaRef}
              aria-label={t("messageLabel")}
              name="message"
              autoComplete="off"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={
                canChat
                  ? sending
                    ? t("queuePlaceholder")
                    : t("messagePlaceholder")
                  : t("setupPlaceholder")
              }
              disabled={!canChat}
              rows={1}
              className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0 sm:min-h-12 sm:px-3 sm:py-3 sm:text-sm placeholder:text-muted-foreground"
            />

            <Button
              type="submit"
              size="icon"
              disabled={!canChat || (!input.trim() && attachments.length === 0)}
              aria-label={sending ? t("queueMessage") : t("sendMessage")}
              className={cn(
                "size-10 shrink-0 rounded-xl transition-[background-color,color,opacity]",
                canChat && (input.trim() || attachments.length > 0)
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "opacity-60",
              )}
            >
              <SendIcon className="size-4" aria-hidden="true" />
            </Button>

            {sending ? (
              <Button
                type="button"
                size="icon"
                aria-label={t("stopGeneration")}
                className="size-10 shrink-0 rounded-xl bg-destructive text-destructive-foreground transition-[background-color,color] hover:bg-destructive/90"
                onClick={onStop}
              >
                <SquareIcon
                  className="size-3.5 fill-current"
                  aria-hidden="true"
                />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-1.5 min-h-5 px-1">
          {!canChat ? (
            <p className="text-xs text-muted-foreground animate-in-fade">
              {t("needsSetup")}{" "}
              <Link
                href="/agents"
                className="font-medium underline underline-offset-2 transition-colors hover:text-primary"
              >
                {t("configureAssistant")}
              </Link>
            </p>
          ) : (
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              {sending ? t("queueHint") : t("sendHint")}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
