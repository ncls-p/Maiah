"use client";

import { FileIcon,FolderIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { useMemo,useRef } from "react";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import { ToolStateIcon } from "@/components/chat/tool-state-icon";
import { cn } from "@/lib/utils";
import { BUTTON_TYPE,CODE_WORKSPACE_ARTIFACT_EVENT,formatBytes } from "./code-workspace-artifact-card.button-type";
import { CodeWorkspaceTreeNode,highlightCode } from "./code-workspace-artifact-card.highlight-code";

export function CodeWorkspaceFileTree({ nodes, selectedPath, onSelect, level = 0 }: { nodes: CodeWorkspaceTreeNode[]; selectedPath: string | null; onSelect: (path: string) => void; level?: number }) {
  return (
    <div className={level === 0 ? "space-y-0.5" : undefined}>
      {nodes.map((node) => {
        if (node.type === "directory") {
          return (
            <div key={node.path}>
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground" style={{ paddingLeft: 8 + level * 12 }}>
                <FolderIcon className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{node.name}</span>
              </div>
              <CodeWorkspaceFileTree nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} level={level + 1} />
            </div>
          );
        }
        return (
          <button key={node.path} type={BUTTON_TYPE} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted", selectedPath === node.path && "bg-muted text-foreground")} style={{ paddingLeft: 8 + level * 12 }} onClick={() => onSelect(node.path)}>
            <FileIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {node.file ? <span className="shrink-0 text-[10px] text-muted-foreground/70">{node.file.binary ? "asset" : formatBytes(node.file.size)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function CodeWorkspaceEditor({ value, filePath, disabled, onChange, className }: { value: string; filePath: string | null; disabled?: boolean; onChange: (value: string) => void; className?: string }) {
  const t = useTranslations("chat.artifacts");
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const highlighted = useMemo(() => highlightCode(value, filePath), [filePath, value]);

  function syncScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  return (
    <div className={cn("relative min-h-[420px] flex-1 overflow-hidden bg-background", className)}>
      <pre ref={highlightRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-auto p-3 font-mono text-[11px] leading-4 whitespace-pre text-foreground">
        {highlighted}
      </pre>
      <textarea aria-label={filePath ? t("codeEditorFor", { path: filePath }) : t("codeEditor")} value={value} onChange={(event) => onChange(event.target.value)} onScroll={syncScroll} disabled={disabled} spellCheck={false} wrap="off" className="absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent p-3 font-mono text-[11px] leading-4 text-transparent caret-foreground outline-none selection:bg-primary/20 focus:ring-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:opacity-70" />
    </div>
  );
}

type CodeWorkspaceArtifactEventDetail = {
  artifact: CodeWorkspaceArtifact;
  activate?: boolean;
};

export function codeWorkspaceArtifactFromEvent(event: Event) {
  const detail = (event as CustomEvent<CodeWorkspaceArtifactEventDetail>).detail;
  return detail?.artifact ?? null;
}

export function dispatchCodeWorkspaceArtifact(artifact: CodeWorkspaceArtifact, options: { activate?: boolean } = {}) {
  window.dispatchEvent(
    new CustomEvent<CodeWorkspaceArtifactEventDetail>(CODE_WORKSPACE_ARTIFACT_EVENT, {
      detail: { artifact, activate: options.activate },
    }),
  );
}

export type WorkspaceArtifactDisplay = "full" | "summary";

export function CodeWorkspaceArtifactSummary({ artifact }: { artifact: CodeWorkspaceArtifact }) {
  const t = useTranslations("chat.artifacts");
  return (
    <button type={BUTTON_TYPE} className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl bg-muted/25 px-2.5 py-0.5 text-left text-xs shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_72%,transparent),0_12px_24px_-24px_color-mix(in_oklch,var(--foreground)_30%,transparent)] transition-[background-color,box-shadow,scale] duration-150 ease-out hover:bg-primary/[0.025] hover:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_18%,transparent),0_14px_28px_-22px_color-mix(in_oklch,var(--primary)_42%,transparent)] active:scale-[0.96]" onClick={() => dispatchCodeWorkspaceArtifact(artifact, { activate: true })}>
      <ToolStateIcon state="completed" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{artifact.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {t("workspaceSummary", {
            version: artifact.version,
            count: artifact.files.length,
          })}
        </span>
      </span>
    </button>
  );
}

export type GitHubPublishOutput = {
  kind: "github_publish_result";
  mode: "pull_request" | "direct_push";
  repository: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitSha: string;
  pullRequestUrl: string | null;
  message: string;
};
