"use client";

import { ChevronDownIcon, FileUpIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { createPortal } from "react-dom";

import { ChatComposerBody } from "@/components/chat/chat-composer-body";
import {
  createPastedTextUploadFile,
  shouldUploadPastedText,
} from "@/components/chat/chat-composer-paste";
import { useChatComposerControls } from "@/components/chat/chat-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ChatComposerProps,
  filesFromDataTransfer,
} from "./chat-composer.queued-chat-message";
import { useComposerFileUploads } from "./chat-composer.chat-composer.section-1";

function queuedPreview(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 72).trimEnd()}…`;
}

function QueuedMessagesPanel({
  messages,
  onChange,
  onCancel,
}: {
  messages: NonNullable<ChatComposerProps["queuedMessages"]>;
  onChange?: ChatComposerProps["onQueuedMessageChange"];
  onCancel?: ChatComposerProps["onQueuedMessageCancel"];
}) {
  const t = useTranslations("chat.composer");
  // Mounted only while the queue is non-empty, so expand state resets to collapsed.
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-slot="chat-composer-queued"
      className="mx-auto mb-2 w-full min-w-0 max-w-4xl shrink-0"
    >
      <div className="composer-box overflow-hidden rounded-3xl">
        <button
          type="button"
          aria-expanded={expanded}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left outline-none transition-[background-color] duration-150 hover:bg-muted/35 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset"
          onClick={() => setExpanded((open) => !open)}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-[0.7rem] tabular-nums text-primary">
            {messages.length}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              {t("queuedSummary", { count: messages.length })}
            </span>
            {!expanded ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {queuedPreview(messages[0]?.content ?? "")}
              </span>
            ) : (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t("queuedChainHint")}
              </span>
            )}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        {expanded ? (
          <ul
            data-slot="chat-composer-queued-list"
            className="m-0 max-h-[min(32vh,14rem)] list-none space-y-2 overflow-y-auto overscroll-contain border-t border-border/50 px-3 py-2.5 scrollbar-thin sm:px-3.5"
          >
            {messages.map((message, index) => (
              <li key={message.id} className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-2 px-0.5">
                  <span className="truncate text-xs text-muted-foreground">
                    {t("queuedMessage", { count: index + 1 })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
                    aria-label={t("cancelQueued")}
                    onClick={() => onCancel?.(message.id)}
                  >
                    <XIcon className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
                <Textarea
                  aria-label={t("queuedMessage", { count: index + 1 })}
                  value={message.content}
                  onChange={(event) =>
                    onChange?.(message.id, event.target.value)
                  }
                  rows={Math.min(
                    3,
                    Math.max(1, message.content.split("\n").length),
                  )}
                  className="field-sizing-fixed max-h-24 min-h-9 resize-none overflow-y-auto overscroll-contain rounded-2xl border-border/60 bg-background/70 px-3 py-2 text-sm leading-5 shadow-none"
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function ChatComposer({
  input,
  canChat,
  needsSetup = false,
  sending,
  maxInputCharacters,
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
  const {
    uploadingAttachment,
    draggingFiles,
    handleSelectedFiles,
    handleFileChange,
  } = useComposerFileUploads({
    needsSetup,
    sending,
    onUploadCodeWorkspace,
    onUploadChatAttachment,
  });
  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = filesFromDataTransfer(event.clipboardData);
    if (files.length > 0) {
      event.preventDefault();
      void handleSelectedFiles(files);
      return;
    }
    const text = event.clipboardData.getData("text/plain");
    if (
      !shouldUploadPastedText(text) ||
      uploadingAttachment ||
      needsSetup ||
      sending ||
      !onUploadChatAttachment
    )
      return;
    event.preventDefault();
    void handleSelectedFiles([createPastedTextUploadFile(text)]);
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
      {draggingFiles
        ? // Portaled to <body>: `.app-shell__main` uses `contain: paint`, which
          // would otherwise clip this full-screen overlay to the content pane.
          createPortal(
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center bg-background/72 p-5 backdrop-blur-md animate-in fade-in duration-150"
              role="status"
              aria-live="polite"
            >
              <div
                className={cn(
                  "pointer-events-none flex w-full max-w-md flex-col items-center rounded-[2rem] border border-dashed px-8 py-10 text-center shadow-[0_28px_90px_-36px_rgba(3,105,161,0.55)] transition-[border-color,background-color,box-shadow,transform] duration-200 animate-in zoom-in-95",
                  !needsSetup && !sending && !uploadingAttachment
                    ? "border-primary/55 bg-card/96 text-foreground ring-4 ring-primary/8"
                    : "border-border bg-card/96 text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "mb-4 flex size-14 items-center justify-center rounded-2xl border shadow-sm",
                    !needsSetup && !sending && !uploadingAttachment
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
                      : needsSetup
                        ? t("setupPlaceholder")
                        : t("dropFilesTitle")}
                </span>
                {!needsSetup && !sending && !uploadingAttachment ? (
                  <span className="mt-1.5 max-w-sm text-sm leading-5 text-muted-foreground">
                    {t("dropFilesDescription")}
                  </span>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
      {queuedMessages.length > 0 ? (
        <QueuedMessagesPanel
          messages={queuedMessages}
          onChange={onQueuedMessageChange}
          onCancel={onQueuedMessageCancel}
        />
      ) : null}
      <ChatComposerBody
        input={input}
        maxInputCharacters={maxInputCharacters}
        canChat={canChat}
        needsSetup={needsSetup}
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
