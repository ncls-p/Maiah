"use client";

import { Maximize2Icon } from "lucide-react";
import { useState, type UIEvent, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { useCodeWorkspaceHighlight } from "@/components/chat/code-workspace-artifact-card.use-highlight";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkflowAssistedCodeEditor } from "./workflow-assisted-code-editor";
import { cn } from "@/lib/utils";

let assistancePreference = false;
function readAssistance() {
  try {
    return localStorage.getItem("workflow-code-assistance") === "true";
  } catch {
    return assistancePreference;
  }
}
function subscribeAssistance(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener("workflow-code-assistance-change", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("workflow-code-assistance-change", notify);
  };
}

function Editor({
  id,
  value,
  language,
  fullscreen,
  onChange,
}: {
  id: string;
  value: string;
  language: string;
  fullscreen?: boolean;
  onChange: (value: string) => void;
}) {
  const lineRef = useRef<HTMLDivElement>(null);
  const highlighted = useCodeWorkspaceHighlight(
    value,
    language === "python" ? "workflow.py" : "workflow.js",
  );
  function sync(event: UIEvent<HTMLTextAreaElement>) {
    const pre = event.currentTarget
      .previousElementSibling as HTMLElement | null;
    if (lineRef.current)
      lineRef.current.scrollTop = event.currentTarget.scrollTop;
    if (pre) {
      pre.scrollTop = event.currentTarget.scrollTop;
      pre.scrollLeft = event.currentTarget.scrollLeft;
    }
  }
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-background shadow-inner focus-within:ring-2 focus-within:ring-ring",
        fullscreen ? "h-[calc(100dvh-10rem)]" : "h-80",
      )}
    >
      <pre
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-auto p-4 pl-14 font-mono text-xs leading-6 whitespace-pre"
      >
        {highlighted}
      </pre>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={sync}
        wrap="off"
        spellCheck={false}
        aria-label="Code"
        className="absolute inset-0 size-full resize-none overflow-auto bg-transparent p-4 pl-14 font-mono text-xs leading-6 whitespace-pre text-transparent caret-foreground outline-none selection:bg-primary/25"
      />
      <div
        ref={lineRef}
        aria-hidden="true"
        className="pointer-events-none overflow-hidden absolute inset-y-0 left-0 w-11 border-r bg-muted/70 px-2 pt-4 text-right font-mono text-xs leading-6 text-muted-foreground select-none"
      >
        {Array.from(
          { length: Math.max(1, value.split("\n").length) },
          (_, i) => (
            <div key={i}>{i + 1}</div>
          ),
        )}
      </div>
    </div>
  );
}

export function WorkflowCodeEditor({
  id,
  value,
  language,
  onChange,
}: {
  id: string;
  value: string;
  language: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("workflows");
  const assisted = useSyncExternalStore(
    subscribeAssistance,
    readAssistance,
    () => false,
  );
  const [failed, setFailed] = useState(false);
  function toggle() {
    setFailed(false);
    assistancePreference = !assisted;
    try {
      localStorage.setItem("workflow-code-assistance", String(!assisted));
    } catch {
      /* Storage is optional. */
    }
    window.dispatchEvent(new Event("workflow-code-assistance-change"));
  }
  function renderEditor(fullscreen = false) {
    return assisted && !failed ? (
      <WorkflowAssistedCodeEditor
        key={language}
        value={value}
        language={language}
        fullscreen={fullscreen}
        onChange={onChange}
        onError={() => setFailed(true)}
      />
    ) : (
      <Editor
        id={fullscreen ? `${id}-fullscreen` : id}
        value={value}
        language={language}
        fullscreen={fullscreen}
        onChange={onChange}
      />
    );
  }
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
            {language === "python" ? "Python" : "JavaScript"}
          </span>
          <Button
            type="button"
            variant={assisted ? "secondary" : "outline"}
            size="sm"
            aria-pressed={assisted}
            onClick={toggle}
          >
            {t("codeAssistance")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Maximize2Icon data-icon="inline-start" />
            {t("codeFullscreen")}
          </Button>
        </div>
        {!open && renderEditor()}
        {failed && (
          <p role="alert" className="text-xs text-destructive">
            {t("codeAssistanceFailed")}
          </p>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>{t("codeEditorTitle")}</DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              aria-pressed={assisted}
              onClick={toggle}
            >
              {t("codeAssistance")}
            </Button>
            <DialogDescription>{t("codeEditorDescription")}</DialogDescription>
          </DialogHeader>
          {open && renderEditor(true)}
        </DialogContent>
      </Dialog>
    </>
  );
}
