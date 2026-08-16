"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import TurndownService from "turndown";

import { Button } from "@/components/ui/button";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { cn } from "@/lib/utils";

export interface RichEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}

const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
];

function ToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "size-8 rounded-xl p-0 text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.96]",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </Button>
  );
}

export function RichEditor({
  value,
  onChange,
  onSave,
  onCancel,
  disabled,
  className,
}: RichEditorProps) {
  const t = useTranslations("chat.richEditor");
  const prevValue = useRef(value);
  const initialized = useRef(false);
  const turndown = useMemo(
    () =>
      new TurndownService({
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        headingStyle: "atx",
      }),
    [],
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: markdownToHtml(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "tiptap-content min-h-[5.5rem] max-h-56 overflow-y-auto px-3.5 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground",
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = turndown.turndown(current.getHTML()).trim();
      if (markdown !== prevValue.current) {
        prevValue.current = markdown;
        onChange?.(markdown);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (initialized.current && value === prevValue.current) return;

    prevValue.current = value;
    initialized.current = true;
    editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return null;

  const iconClass = "size-3.5";

  return (
    <div
      className={cn(
        "composer-box flex w-full min-w-[min(100%,20rem)] max-w-xl flex-col overflow-hidden rounded-[1.35rem]",
        className,
      )}
    >
      <div className="flex items-center gap-0.5 px-2 pt-2 sm:px-2.5">
        <ToolbarButton
          label={t("bold")}
          disabled={disabled}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon className={iconClass} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label={t("italic")}
          disabled={disabled}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon className={iconClass} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label={t("strikethrough")}
          disabled={disabled}
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon className={iconClass} aria-hidden="true" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />

        <ToolbarButton
          label={t("inlineCode")}
          disabled={disabled}
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <CodeIcon className={iconClass} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label={t("blockquote")}
          disabled={disabled}
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <QuoteIcon className={iconClass} aria-hidden="true" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />

        <ToolbarButton
          label={t("bulletList")}
          disabled={disabled}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListIcon className={iconClass} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label={t("orderedList")}
          disabled={disabled}
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon className={iconClass} aria-hidden="true" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} disabled={disabled} />

      <div className="flex items-center justify-end gap-2 border-t border-border/55 px-2.5 py-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={onCancel}
          className="h-9 rounded-xl px-3 text-muted-foreground hover:text-foreground"
        >
          {t("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || !value.trim()}
          onClick={onSave}
          className="h-9 rounded-xl px-3.5 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
