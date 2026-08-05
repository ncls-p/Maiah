"use client";

import { Link } from "@/i18n/navigation";
import { FileUpIcon,Loader2Icon,PaperclipIcon,SendIcon,SquareIcon,XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback,useEffect,useRef,useState } from "react";
import { toast } from "sonner";

import { useChatComposerControls } from "@/components/chat/chat-layout";

import { ChatTodoListDock } from "@/components/chat/chat-todo-list-card";
import { AttachmentGroup } from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AttachmentPreview,ChatComposerProps,dataTransferContainsFiles,filesFromDataTransfer,isDirectCodeFile,uploadedFilePath } from "./chat-composer.queued-chat-message";

export function ChatComposer({ input, canChat, sending, queuedMessages = [], onSubmit, onInputChange, onStop, onQueuedMessageChange, onQueuedMessageCancel, onUploadCodeWorkspace, onUploadChatAttachment, attachments = [], onRemoveAttachment, todoList, centered = false, promptSuggestions = [], onPromptSuggestionClick }: ChatComposerProps) {
  const t = useTranslations("chat.composer");
  const composerControls = useChatComposerControls();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${newHeight}px`;
  }, [input]);

  const handleSelectedFiles = useCallback(
    async (files: File[]) => {
      const uploadedFiles = files.filter(Boolean);
      if (uploadedFiles.length === 0 || uploadingAttachment) return;
      if (!canChat) return;
      if (sending) {
        toast.error(t("waitForResponse"));
        return;
      }
      setUploadingAttachment(true);
      try {
        const zipFiles = uploadedFiles.filter((file) => file.name.toLowerCase().endsWith(".zip"));
        const codeFiles = uploadedFiles.filter(isDirectCodeFile);
        if (zipFiles.length > 0) {
          if (uploadedFiles.length > 1) {
            toast.error(t("singleZip"));
            return;
          }
          await onUploadCodeWorkspace?.(zipFiles);
          return;
        }
        if (codeFiles.length === uploadedFiles.length && codeFiles.some((file) => /\.html?$/i.test(uploadedFilePath(file)))) {
          await onUploadCodeWorkspace?.(codeFiles);
          return;
        }
        if (!onUploadChatAttachment) {
          toast.error(t("unavailable"));
          return;
        }
        for (const file of uploadedFiles) {
          await onUploadChatAttachment(file);
        }
      } finally {
        setUploadingAttachment(false);
      }
    },
    [canChat, onUploadChatAttachment, onUploadCodeWorkspace, sending, t, uploadingAttachment],
  );

  useEffect(() => {
    let dragDepth = 0;

    function resetFileDrag() {
      dragDepth = 0;
      setDraggingFiles(false);
    }

    function handleDocumentDragEnter(event: DragEvent) {
      if (!dataTransferContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepth += 1;
      setDraggingFiles(true);
    }

    function handleDocumentDragOver(event: DragEvent) {
      if (!dataTransferContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = canChat && !sending && !uploadingAttachment ? "copy" : "none";
      }
    }

    function handleDocumentDragLeave() {
      if (dragDepth === 0) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDraggingFiles(false);
    }

    function handleDocumentDrop(event: DragEvent) {
      if (!dataTransferContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      resetFileDrag();
      if (!event.dataTransfer) return;
      void handleSelectedFiles(filesFromDataTransfer(event.dataTransfer));
    }

    document.addEventListener("dragenter", handleDocumentDragEnter);
    document.addEventListener("dragover", handleDocumentDragOver);
    document.addEventListener("dragleave", handleDocumentDragLeave);
    document.addEventListener("drop", handleDocumentDrop);
    window.addEventListener("blur", resetFileDrag);
    return () => {
      document.removeEventListener("dragenter", handleDocumentDragEnter);
      document.removeEventListener("dragover", handleDocumentDragOver);
      document.removeEventListener("dragleave", handleDocumentDragLeave);
      document.removeEventListener("drop", handleDocumentDrop);
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
      className={cn("composer-dock relative z-20 w-full min-w-0 shrink-0 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[transform,background] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-5 sm:pt-4", centered ? "bg-transparent" : "translate-y-0 bg-[linear-gradient(to_top,var(--background)_58%,transparent)]")}
    >
      {draggingFiles ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/72 p-5 backdrop-blur-md animate-in fade-in duration-150" role="status" aria-live="polite">
          <div className={cn("pointer-events-none flex w-full max-w-md flex-col items-center rounded-[2rem] border border-dashed px-8 py-10 text-center shadow-[0_28px_90px_-36px_rgba(3,105,161,0.55)] transition-[border-color,background-color,box-shadow,transform] duration-200 animate-in zoom-in-95", canChat && !sending && !uploadingAttachment ? "border-primary/55 bg-card/96 text-foreground ring-4 ring-primary/8" : "border-border bg-card/96 text-muted-foreground")}>
            <span className={cn("mb-4 flex size-14 items-center justify-center rounded-2xl border shadow-sm", canChat && !sending && !uploadingAttachment ? "border-primary/20 bg-primary/10 text-primary" : "border-border bg-muted")}>
              <FileUpIcon className="size-6" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-[-0.015em]">{uploadingAttachment ? t("uploadingFiles") : sending ? t("waitForResponse") : canChat ? t("dropFilesTitle") : t("setupPlaceholder")}</span>
            {canChat && !sending && !uploadingAttachment ? <span className="mt-1.5 max-w-sm text-sm leading-5 text-muted-foreground">{t("dropFilesDescription")}</span> : null}
          </div>
        </div>
      ) : null}
      {queuedMessages.length > 0 ? (
        <div className="mx-auto mb-2 flex w-full max-w-4xl flex-col gap-2">
          {queuedMessages.map((message, index) => (
            <div key={message.id} className="rounded-2xl border border-transparent bg-card p-3 shadow-[var(--surface-shadow)]">
              <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-medium text-muted-foreground">{t("queuedMessage", { count: index + 1 })}</span>
                <Button type="button" variant="ghost" size="icon" className="size-10 rounded-xl text-muted-foreground hover:text-foreground" aria-label={t("cancelQueued")} onClick={() => onQueuedMessageCancel?.(message.id)}>
                  <XIcon className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
              <Textarea aria-label={t("queuedMessage", { count: index + 1 })} value={message.content} onChange={(event) => onQueuedMessageChange?.(message.id, event.target.value)} rows={1} className="max-h-28 min-h-10 resize-none text-sm shadow-none" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="relative mx-auto w-full min-w-0 max-w-4xl">
        {todoList ? (
          <div className="mb-2">
            <ChatTodoListDock todoList={todoList} />
          </div>
        ) : null}
        {attachments.length > 0 ? (
          <div className="mb-2 rounded-2xl border border-border/55 bg-card/72 p-2 shadow-[var(--surface-shadow)]">
            <div className="flex min-h-8 items-center gap-2 px-1 pb-1.5">
              <PaperclipIcon className="size-3.5 text-primary" aria-hidden="true" />
              <span className="text-xs font-medium text-foreground" aria-live="polite">
                {t("attachedFiles", { count: attachments.length })}
              </span>
            </div>
            <AttachmentGroup className="grid snap-none grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))] gap-2 overflow-visible overscroll-auto py-0">
              {attachments.map((attachment) => (
                <AttachmentPreview key={attachment.id} attachment={attachment} onRemove={onRemoveAttachment} />
              ))}
            </AttachmentGroup>
          </div>
        ) : null}
        <div className="composer-box overflow-hidden rounded-3xl">
          <div className="px-3 pt-2.5 sm:px-4 sm:pt-3">
            <input ref={fileInputRef} type="file" className="hidden" multiple onChange={(event) => void handleFileChange(event)} />
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
              placeholder={canChat ? (sending ? t("queuePlaceholder") : t("messagePlaceholder")) : t("setupPlaceholder")}
              disabled={!canChat}
              rows={1}
              className="max-h-40 min-h-14 w-full resize-none border-0 bg-transparent px-1 py-2 text-base shadow-none hover:border-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:min-h-16 sm:py-2.5 sm:text-sm placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex min-h-14 min-w-0 items-center gap-1.5 border-t border-border/55 px-2 py-1.5 sm:gap-2 sm:px-3">
            <Button type="button" size="icon" variant="ghost" className="size-10 shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("uploadFiles")} disabled={uploadingAttachment || sending || !canChat} onClick={() => fileInputRef.current?.click()}>
              {uploadingAttachment ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : <PaperclipIcon className="size-4" aria-hidden="true" />}
            </Button>
            {composerControls}
            <span className="hidden min-w-0 flex-1 sm:block" />
            <span className="hidden shrink-0 text-[0.65rem] text-muted-foreground lg:inline">{sending ? t("queueHint") : t("sendHint")}</span>
            <Button type="submit" size="icon" disabled={!canChat || (!input.trim() && attachments.length === 0)} aria-label={sending ? t("queueMessage") : t("sendMessage")} className={cn("size-10 shrink-0 rounded-xl transition-[background-color,color,box-shadow,opacity]", canChat && (input.trim() || attachments.length > 0) ? "bg-primary text-primary-foreground hover:bg-primary/90" : "opacity-60")}>
              <SendIcon className="size-4" aria-hidden="true" />
            </Button>

            {sending ? (
              <Button type="button" size="icon" aria-label={t("stopGeneration")} className="size-10 shrink-0 rounded-2xl bg-destructive text-destructive-foreground transition-[background-color,color,box-shadow] hover:bg-destructive/90" onClick={onStop}>
                <SquareIcon className="size-3.5 fill-current" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>

        {centered && canChat && promptSuggestions.length > 0 ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-3 animate-in-fade">
            {promptSuggestions.slice(0, 3).map((suggestion, index) => (
              <button key={suggestion} type="button" className="group min-h-10 truncate rounded-xl border border-border/70 bg-card/55 px-3 text-left text-xs text-muted-foreground transition-[border-color,background-color,color,transform] hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => onPromptSuggestionClick?.(suggestion)}>
                <span className="mr-2 font-mono text-[0.62rem] text-primary">{String(index + 1).padStart(2, "0")}</span>
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-1.5 min-h-5 px-1">
          {!canChat ? (
            <p className="text-xs text-muted-foreground animate-in-fade">
              {t("needsSetup")}{" "}
              <Link href="/agents" className="font-medium underline underline-offset-2 transition-colors hover:text-primary">
                {t("configureAssistant")}
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
