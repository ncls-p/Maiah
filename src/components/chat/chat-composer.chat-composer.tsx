"use client";

import { FileUpIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ChatComposerBody } from "@/components/chat/chat-composer-body";
import { useChatComposerControls } from "@/components/chat/chat-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ChatComposerProps,
  dataTransferContainsFiles,
  filesFromDataTransfer,
  isDirectCodeFile,
  uploadedFilePath,
} from "./chat-composer.queued-chat-message";

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
  todoList,
  centered = false,
  promptSuggestions = [],
  onPromptSuggestionClick,
}: ChatComposerProps) {
  const t = useTranslations("chat.composer");
  const controls = useChatComposerControls();
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);

  const handleSelectedFiles = useCallback(
    async (files: File[]) => {
      const uploadedFiles = files.filter(Boolean);
      if (uploadedFiles.length === 0 || uploadingAttachment || !canChat) return;
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
        for (const file of uploadedFiles) await onUploadChatAttachment(file);
      } finally {
        setUploadingAttachment(false);
      }
    },
    [
      canChat,
      onUploadChatAttachment,
      onUploadCodeWorkspace,
      sending,
      t,
      uploadingAttachment,
    ],
  );

  useEffect(() => {
    let dragDepth = 0;
    function resetFileDrag() {
      dragDepth = 0;
      setDraggingFiles(false);
    }
    function onDragEnter(event: DragEvent) {
      if (!dataTransferContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepth += 1;
      setDraggingFiles(true);
    }
    function onDragOver(event: DragEvent) {
      if (!dataTransferContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer)
        event.dataTransfer.dropEffect =
          canChat && !sending && !uploadingAttachment ? "copy" : "none";
    }
    function onDragLeave() {
      if (dragDepth === 0) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDraggingFiles(false);
    }
    function onDrop(event: DragEvent) {
      if (!dataTransferContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      resetFileDrag();
      if (event.dataTransfer)
        void handleSelectedFiles(filesFromDataTransfer(event.dataTransfer));
    }
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    window.addEventListener("blur", resetFileDrag);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
      window.removeEventListener("blur", resetFileDrag);
    };
  }, [canChat, handleSelectedFiles, sending, uploadingAttachment]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await handleSelectedFiles(files);
  }
  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = filesFromDataTransfer(event.clipboardData);
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
      data-centered={centered}
      className={cn(
        "composer-dock relative z-20 w-full min-w-0 shrink-0 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[transform,background] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-5 sm:pt-4",
        centered
          ? "bg-transparent"
          : "translate-y-0 bg-[linear-gradient(to_top,var(--background)_58%,transparent)]",
      )}
    >
      {draggingFiles ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-background/72 p-5 backdrop-blur-md animate-in fade-in duration-150"
          role="status"
          aria-live="polite"
        >
          <div
            className={cn(
              "pointer-events-none flex w-full max-w-md flex-col items-center rounded-[2rem] border border-dashed px-8 py-10 text-center shadow-[0_28px_90px_-36px_rgba(3,105,161,0.55)] transition-[border-color,background-color,box-shadow,transform] duration-200 animate-in zoom-in-95",
              canChat && !sending && !uploadingAttachment
                ? "border-primary/55 bg-card/96 text-foreground ring-4 ring-primary/8"
                : "border-border bg-card/96 text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "mb-4 flex size-14 items-center justify-center rounded-2xl border shadow-sm",
                canChat && !sending && !uploadingAttachment
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-border bg-muted",
              )}
            >
              <FileUpIcon className="size-6" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-[-0.015em]">
              {uploadingAttachment
                ? t("uploadingFiles")
                : sending
                  ? t("waitForResponse")
                  : canChat
                    ? t("dropFilesTitle")
                    : t("setupPlaceholder")}
            </span>
            {canChat && !sending && !uploadingAttachment ? (
              <span className="mt-1.5 max-w-sm text-sm leading-5 text-muted-foreground">
                {t("dropFilesDescription")}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {queuedMessages.length > 0 ? (
        <div className="mx-auto mb-2 flex w-full max-w-4xl flex-col gap-2">
          {queuedMessages.map((message, index) => (
            <div
              key={message.id}
              className="rounded-2xl border border-transparent bg-card p-3 shadow-[var(--surface-shadow)]"
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
      <ChatComposerBody
        input={input}
        canChat={canChat}
        sending={sending}
        attachments={attachments}
        todoList={todoList}
        centered={centered}
        promptSuggestions={promptSuggestions}
        uploadingAttachment={uploadingAttachment}
        controls={controls}
        onInputChange={onInputChange}
        onStop={onStop}
        onRemoveAttachment={onRemoveAttachment}
        onPromptSuggestionClick={onPromptSuggestionClick}
        onFileChange={(event) => void handleFileChange(event)}
        onPaste={handlePaste}
      />
    </form>
  );
}
