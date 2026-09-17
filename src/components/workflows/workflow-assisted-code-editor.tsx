"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "@teispace/next-themes";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  typescriptShape,
  type WorkflowCodeContext,
} from "./workflow-code-context";

export const WorkflowCodeContextProvider = createContext<WorkflowCodeContext>({
  input: { kind: "unknown" },
  nodes: [],
  edges: [],
});

export function WorkflowAssistedCodeEditor({
  value,
  language,
  fullscreen,
  onChange,
  onError,
}: {
  value: string;
  language: string;
  fullscreen?: boolean;
  onChange: (value: string) => void;
  onError: () => void;
}) {
  const context = useContext(WorkflowCodeContextProvider);
  const { resolvedTheme } = useTheme();
  const t = useTranslations("workflows");
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState(0);
  const [inventory, setInventory] = useState<{
    packages: string[];
    typed: string[];
  }>();
  const latest = useRef({
    value,
    context,
    onChange,
    onError,
    dark: resolvedTheme === "dark",
  });
  useEffect(() => {
    latest.current = {
      value,
      context,
      onChange,
      onError,
      dark: resolvedTheme === "dark",
    };
  });
  const signature = language + JSON.stringify(context.input);
  useEffect(() => {
    const target = frame.current?.contentWindow;
    let done = false;
    const timeout = window.setTimeout(() => {
      if (!done) latest.current.onError();
    }, 45000);
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== target ||
        event.data?.source !== "workflow-editor"
      )
        return;
      const data = event.data;
      if (data.type === "loaded")
        target?.postMessage(
          {
            source: "workflow-host",
            type: "init",
            ...latest.current,
            onChange: undefined,
            onError: undefined,
            language,
            label: t("codeEditorTitle"),
          },
          location.origin,
        );
      if (data.type === "ready") {
        done = true;
        setReady(true);
        setInventory({ packages: data.packages, typed: data.typed });
      }
      if (data.type === "change" && typeof data.value === "string")
        latest.current.onChange(data.value);
      if (data.type === "diagnostics") setErrors(data.count);
      if (data.type === "error") latest.current.onError();
    }
    window.addEventListener("message", receive);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      target?.postMessage(
        { source: "workflow-host", type: "dispose" },
        location.origin,
      );
    };
  }, [signature, language, t]);
  useEffect(() => {
    if (ready)
      frame.current?.contentWindow?.postMessage(
        {
          source: "workflow-host",
          type: "update",
          value,
          context,
          dark: resolvedTheme === "dark",
        },
        location.origin,
      );
  }, [value, context, resolvedTheme, ready]);
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border",
          fullscreen ? "h-[calc(100dvh-17rem)]" : "h-80",
        )}
      >
        <iframe
          key={signature}
          ref={frame}
          src="/vendor/workflow-editor/index.html"
          onLoad={() => {
            setReady(false);
            setErrors(0);
          }}
          title={t("codeEditorTitle")}
          className="size-full border-0"
        />
        {!ready && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center gap-2 bg-background"
          >
            <Loader2Icon className="size-4 animate-spin" />
            {t("codeAssistanceLoading")}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {errors > 0 && <AlertCircleIcon className="mr-1 inline size-3" />}
        {t("codeAssistanceHint", { count: errors })}
      </p>
      <details className="rounded-lg border px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium">
          {t("codeWorkflowContext")}
        </summary>
        <div className="max-h-52 space-y-3 overflow-auto pt-3">
          <p>{t("codeInputHint")}</p>
          <pre className="whitespace-pre-wrap break-all font-mono">
            {typescriptShape(context.input)}
          </pre>
          {context.nodes.map((node) => (
            <details key={node.id}>
              <summary className="cursor-pointer">
                {node.label} · {node.type}
              </summary>
              <pre className="mt-1 whitespace-pre-wrap break-all font-mono">
                {`input: ${typescriptShape(node.input)}\noutput: ${typescriptShape(node.output)}`}
                {node.code ? `\n\n${node.code}` : ""}
              </pre>
            </details>
          ))}
          {inventory && (
            <p>
              {t("codeLibraryHint")} {inventory.packages.join(", ")}.{" "}
              {t("codeTypedLibraries")} {inventory.typed.join(", ")}.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
