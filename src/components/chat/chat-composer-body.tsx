"use client";

import { Loader2Icon, PaperclipIcon, SendIcon, SquareIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef } from "react";

import { Link } from "@/i18n/navigation";
import type { ChatComposerControls } from "@/components/chat/chat-layout.chat-composer-controls-context";
import { ChatTodoListDock } from "@/components/chat/chat-todo-list-card";
import { AttachmentGroup } from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AttachmentPreview,
  ChatComposerProps,
} from "./chat-composer.queued-chat-message";

interface ChatComposerBodyProps {
  input: string;
  canChat: boolean;
  sending: boolean;
  focusKey?: string;
  attachments: NonNullable<ChatComposerProps["attachments"]>;
  todoList: ChatComposerProps["todoList"];
  centered: boolean;
  promptSuggestions: string[];
  uploadingAttachment: boolean;
  controls: ChatComposerControls;
  onInputChange: ChatComposerProps["onInputChange"];
  onStop: ChatComposerProps["onStop"];
  onRemoveAttachment: ChatComposerProps["onRemoveAttachment"];
  onPromptSuggestionClick: ChatComposerProps["onPromptSuggestionClick"];
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

function resizeComposerTextarea(element: HTMLTextAreaElement) {
  element.style.height = "0px";

  const maxHeight = Number.parseFloat(getComputedStyle(element).maxHeight);
  const contentHeight = element.scrollHeight;
  const nextHeight = Number.isFinite(maxHeight)
    ? Math.min(contentHeight, maxHeight)
    : contentHeight;

  element.style.height = `${nextHeight}px`;
  element.style.overflowY = contentHeight > nextHeight ? "auto" : "hidden";
}

export function ChatComposerBody(props: ChatComposerBodyProps) {
  const t = useTranslations("chat.composer");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusedKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!props.canChat || !props.focusKey) return;
    if (focusedKeyRef.current === props.focusKey) return;
    focusedKeyRef.current = props.focusKey;

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.canChat, props.focusKey]);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    const resize = () => resizeComposerTextarea(element);
    resize();
    window.addEventListener("resize", resize);

    return () => window.removeEventListener("resize", resize);
  }, [props.canChat, props.input, props.sending]);
  return (
    <div className="relative mx-auto w-full min-w-0 max-w-4xl">
      {props.todoList ? (
        <div className="mb-2">
          <ChatTodoListDock todoList={props.todoList} />
        </div>
      ) : null}
      {props.attachments.length > 0 ? (
        <div className="mb-2 rounded-2xl border border-border/55 bg-card/72 p-2 shadow-[var(--surface-shadow)]">
          <div className="flex min-h-8 items-center gap-2 px-1 pb-1.5">
            <PaperclipIcon
              className="size-3.5 text-primary"
              aria-hidden="true"
            />
            <span
              className="text-xs font-medium text-foreground"
              aria-live="polite"
            >
              {t("attachedFiles", { count: props.attachments.length })}
            </span>
          </div>
          <AttachmentGroup className="grid snap-none grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))] gap-2 overflow-visible overscroll-auto py-0">
            {props.attachments.map((attachment) => (
              <AttachmentPreview
                key={attachment.id}
                attachment={attachment}
                onRemove={props.onRemoveAttachment}
              />
            ))}
          </AttachmentGroup>
        </div>
      ) : null}
      <div className="composer-box overflow-hidden rounded-3xl">
        <div className="px-3 pt-2 sm:px-4 sm:pt-2.5">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={props.onFileChange}
          />
          <Textarea
            ref={textareaRef}
            aria-label={t("messageLabel")}
            name="message"
            autoComplete="off"
            value={props.input}
            onChange={(event) => props.onInputChange(event.target.value)}
            onPaste={props.onPaste}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              props.canChat
                ? props.sending
                  ? t("queuePlaceholder")
                  : t("messagePlaceholder")
                : t("setupPlaceholder")
            }
            disabled={!props.canChat}
            rows={1}
            className="scrollbar-none max-h-28 min-h-12 w-full resize-none overscroll-contain border-0 bg-transparent px-1 py-1.5 text-base shadow-none hover:border-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:max-h-40 sm:text-sm placeholder:text-muted-foreground"
          />
        </div>
        <div className="grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 border-t border-border/55 px-2 py-1 sm:gap-x-2 sm:px-3">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="col-start-1 row-start-1 size-10 shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("uploadFiles")}
            disabled={
              props.uploadingAttachment || props.sending || !props.canChat
            }
            onClick={() => fileInputRef.current?.click()}
          >
            {props.uploadingAttachment ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <PaperclipIcon className="size-4" aria-hidden="true" />
            )}
          </Button>
          <div
            data-slot="chat-composer-primary-controls"
            className="col-start-2 row-start-1 min-w-0"
          >
            {props.controls.primary}
          </div>
          <div
            data-slot="chat-composer-primary-action"
            className="col-start-3 row-start-1"
          >
            {props.sending ? (
              <Button
                type="button"
                size="icon"
                aria-label={t("stopGeneration")}
                className="size-10 shrink-0 rounded-xl bg-destructive text-destructive-foreground transition-[background-color,color,box-shadow] hover:bg-destructive/90"
                onClick={props.onStop}
              >
                <SquareIcon
                  className="size-3.5 fill-current"
                  aria-hidden="true"
                />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={
                  !props.canChat ||
                  (!props.input.trim() && props.attachments.length === 0)
                }
                aria-label={t("sendMessage")}
                className={cn(
                  "size-10 shrink-0 rounded-xl transition-[background-color,color,box-shadow,opacity]",
                  props.canChat &&
                    (props.input.trim() || props.attachments.length > 0)
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "opacity-60",
                )}
              >
                <SendIcon className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
        {props.controls.secondary ? (
          <div
            data-slot="chat-composer-usage"
            className="border-t border-border/55 px-2 py-1 sm:px-3"
          >
            {props.controls.secondary}
          </div>
        ) : null}
      </div>
      {props.centered && props.canChat && props.promptSuggestions.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-3 animate-in-fade">
          {props.promptSuggestions.slice(0, 3).map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              className="group min-h-10 truncate rounded-xl border border-border/70 bg-card/55 px-3 text-left text-xs text-muted-foreground transition-[border-color,background-color,color,transform] hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => props.onPromptSuggestionClick?.(suggestion)}
            >
              <span className="mr-2 font-mono text-[0.62rem] text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      {!props.canChat ? (
        <div className="mt-1.5 min-h-5 px-1">
          <p className="text-xs text-muted-foreground animate-in-fade">
            {t("needsSetup")}{" "}
            <Link
              href="/agents"
              className="font-medium underline underline-offset-2 transition-colors hover:text-primary"
            >
              {t("configureAssistant")}
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
