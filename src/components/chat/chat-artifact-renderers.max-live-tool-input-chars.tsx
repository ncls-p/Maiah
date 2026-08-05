"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDownIcon, DownloadIcon, Maximize2Icon } from "lucide-react";

import {
  artifactCombinedCode,
  artifactSourceDocument,
  partitionCodeSandboxFiles,
  type CodeSandboxFileOutput,
  type CodeSandboxInputPreview,
  type CodeSandboxOutput,
  type HtmlArtifactOutput,
} from "@/components/chat/chat-message-rendering-utils";
import { Button } from "@/components/ui/button";
import { ToolStateIcon } from "@/components/chat/tool-state-icon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes } from "@/components/chat/code-workspace-artifact-card";
import { cn } from "@/lib/utils";

export const MAX_LIVE_TOOL_INPUT_CHARS = 8000;
export const BUTTON_TYPE = "button";
export const OUTLINE_VARIANT = "outline";
export const GHOST_VARIANT = "ghost";
export const COMPACT_ICON_CLASS = "size-3";

export function ArtifactCodeBlocks({ artifact }: { artifact: HtmlArtifactOutput }) {
  return (
    <div className="grid gap-2 border-t border-border/50 bg-muted/20 p-3">
      {[
        ["HTML", artifact.html],
        ["CSS", artifact.css],
        ["JavaScript", artifact.js],
      ].map(([label, source]) => (
        <div key={label}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {label}
          </div>
          <pre className="max-h-64 overflow-auto rounded-md border border-border/50 bg-background/80 p-2 font-mono text-[11px] leading-4 text-muted-foreground">
            {source || "// empty"}
          </pre>
        </div>
      ))}
    </div>
  );
}

export function LazyArtifactFrame({
  title,
  srcDoc,
  height,
}: {
  title: string;
  srcDoc: string;
  height: number;
}) {
  const t = useTranslations("chat.artifacts");
  const frameRootRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isReady) return;
    const node = frameRootRef.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() => setIsReady(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsReady(true);
        observer.disconnect();
      },
      { rootMargin: "640px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isReady]);

  return (
    <div
      ref={frameRootRef}
      className="flex w-full items-center justify-center bg-white text-xs text-muted-foreground"
      style={{ height }}
    >
      {isReady ? (
        <iframe
          title={title}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-modals"
          loading="lazy"
          className="h-full w-full bg-white"
        />
      ) : (
        <span>{t("previewWhenVisible")}</span>
      )}
    </div>
  );
}
