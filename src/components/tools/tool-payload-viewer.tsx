"use client";

import { useMemo, useState } from "react";
import { CopyIcon, Maximize2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function formatToolPayload(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2) ?? "";
}

/** React escapes every token, including HTML inside JSON strings. */
function JsonText({ text }: { text: string }) {
  const tokens = useMemo(
    () =>
      text.split(
        /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g,
      ),
    [text],
  );
  return (
    <code>
      {tokens.map((token, index) => {
        const color = token.startsWith('"')
          ? token.endsWith(":")
            ? "text-blue-700 dark:text-blue-300"
            : "text-green-700 dark:text-green-300"
          : /^(true|false|null)$/.test(token)
            ? "text-purple-700 dark:text-purple-300"
            : /^-?\d/.test(token)
              ? "text-amber-700 dark:text-amber-300"
              : undefined;
        return (
          <span key={index} className={color}>
            {token}
          </span>
        );
      })}
    </code>
  );
}

export function ToolPayloadViewer({
  label,
  value,
  description,
}: {
  label: string;
  value: unknown;
  description?: string;
}) {
  const t = useTranslations("toolDetails");
  const text = useMemo(() => formatToolPayload(value), [value]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <Dialog onOpenChange={() => setCopyState("idle")}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("expand", { name: label })}
            >
              <Maximize2Icon className="size-3.5" aria-hidden="true" />
            </Button>
          </DialogTrigger>
          <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col rounded-none p-4 sm:max-h-dvh sm:max-w-none sm:rounded-none sm:p-6">
            <DialogHeader>
              <DialogTitle className="break-words">{label}</DialogTitle>
              <DialogDescription>
                {description ?? t("payloadDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                <CopyIcon aria-hidden="true" />
                {t("copy")}
              </Button>
              <span role="status" className="text-sm text-muted-foreground">
                {copyState === "idle" ? "" : t(copyState)}
              </span>
            </div>
            <pre
              tabIndex={0}
              aria-label={label}
              className="min-h-0 flex-1 overflow-auto rounded-lg bg-muted/40 p-4 font-mono text-xs leading-6"
            >
              <JsonText text={text} />
            </pre>
          </DialogContent>
        </Dialog>
      </div>
      <pre
        tabIndex={0}
        aria-label={label}
        className="max-h-32 overflow-auto rounded-lg bg-muted/30 p-2 font-mono text-[11px] leading-5"
      >
        <JsonText text={text} />
      </pre>
    </div>
  );
}
