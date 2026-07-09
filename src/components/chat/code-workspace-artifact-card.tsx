"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import {
  DownloadIcon,
  FileIcon,
  FolderIcon,
  Maximize2Icon,
  RefreshCcwIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import type {
  ChatFileAttachment,
  ChatImageAttachment,
  CodeWorkspaceArtifact,
} from "@/components/chat/chat-types";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useFilePreview,
  FilePreviewDialog,
} from "@/components/chat/file-preview";
import { GitHubPublishDialog } from "@/components/chat/github-publish-dialog";
import { CodeWorkspacePreviewFrame } from "@/components/chat/code-workspace-preview-frame";

const BUTTON_TYPE = "button";
const OUTLINE_VARIANT = "outline";
const GHOST_VARIANT = "ghost";
const COMPACT_ICON_CLASS = "size-3";

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.89-.01-1.75-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05A9.37 9.37 0 0 1 12 6.93c.85 0 1.71.12 2.51.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.64 1.03 2.76 0 3.95-2.34 4.81-4.57 5.07.36.32.68.95.68 1.92 0 1.39-.01 2.51-.01 2.85 0 .27.18.59.69.49A10.05 10.05 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export function isCodeWorkspaceArtifactOutput(
  value: unknown,
): value is CodeWorkspaceArtifact {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "code_workspace_artifact" &&
    typeof record.projectId === "string" &&
    typeof record.title === "string" &&
    typeof record.version === "number" &&
    Array.isArray(record.files)
  );
}

export const CODE_WORKSPACE_ARTIFACT_EVENT = "code-workspace-artifact-updated";

type CodeWorkspaceFilePayload = {
  content?: string;
  error?: string;
};

async function requestCodeWorkspaceJson<T>(
  url: string,
  init: RequestInit | undefined,
  fallbackError: string,
) {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(data?.error || fallbackError);
  return data as T | null;
}

async function loadCodeWorkspaceFileContent(
  projectId: string,
  path: string,
  fallbackError: string,
) {
  const data = await requestCodeWorkspaceJson<CodeWorkspaceFilePayload>(
    `/api/workspace/code-projects/${projectId}/files?path=${encodeURIComponent(path)}`,
    undefined,
    fallbackError,
  );
  if (typeof data?.content !== "string") {
    throw new Error(data?.error || fallbackError);
  }
  return data.content;
}

async function requestUpdatedCodeWorkspaceArtifact(
  projectId: string,
  method: "PUT" | "DELETE",
  payload: { path: string; content?: string },
  fallbackError: string,
) {
  const nextArtifact = await requestCodeWorkspaceJson<
    CodeWorkspaceArtifact | { error?: string }
  >(
    `/api/workspace/code-projects/${projectId}/files`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    fallbackError,
  );
  if (!isCodeWorkspaceArtifactOutput(nextArtifact)) {
    throw new Error(
      (nextArtifact as { error?: string } | null)?.error || fallbackError,
    );
  }
  return nextArtifact;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

function highlightWithRegex(
  value: string,
  pattern: RegExp,
  classify: (token: string) => string | null,
) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? cursor;
    const token = match[0];
    if (index > cursor) nodes.push(value.slice(cursor, index));
    const color = classify(token);
    if (color) {
      nodes.push(
        <span key={`${index}-${tokenIndex}`} style={{ color }}>
          {token}
        </span>,
      );
    } else {
      nodes.push(token);
    }
    cursor = index + token.length;
    tokenIndex += 1;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes.length > 0 ? nodes : " ";
}

const CODE_TOKEN_COLORS = {
  comment: "#6b7280",
  keyword: "#2563eb",
  property: "#9333ea",
  string: "#16a34a",
  number: "#ea580c",
  color: "#dc2626",
} as const;

type CodeHighlightConfig = {
  pattern: RegExp;
  classify: (token: string) => string | null;
};

const isQuotedToken = (token: string) =>
  ['"', "'", "`"].some((quote) => token.startsWith(quote));

const CODE_HIGHLIGHTERS: Record<string, CodeHighlightConfig> = {
  html: {
    pattern:
      /<!--[\s\S]*?-->|<\/?[\w:-]+\b|\/?>|\b[\w:-]+(?=\=)|"[^"]*"|'[^']*'/g,
    classify: (token) => {
      if (token.startsWith("<!--")) return CODE_TOKEN_COLORS.comment;
      if (token.startsWith("<") || token === ">" || token === "/>") {
        return CODE_TOKEN_COLORS.keyword;
      }
      return isQuotedToken(token)
        ? CODE_TOKEN_COLORS.string
        : CODE_TOKEN_COLORS.property;
    },
  },
  css: {
    pattern:
      /\/\*[\s\S]*?\*\/|#[\da-fA-F]{3,8}\b|\b[a-zA-Z-]+(?=\s*:)|"[^"]*"|'[^']*'|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?\b/g,
    classify: (token) => {
      if (token.startsWith("/*")) return CODE_TOKEN_COLORS.comment;
      if (token.startsWith("#")) return CODE_TOKEN_COLORS.color;
      if (isQuotedToken(token)) return CODE_TOKEN_COLORS.string;
      return /^\d/.test(token)
        ? CODE_TOKEN_COLORS.number
        : CODE_TOKEN_COLORS.property;
    },
  },
  js: {
    pattern:
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`])*`|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b/g,
    classify: (token) => {
      if (token.startsWith("/*") || token.startsWith("//")) {
        return CODE_TOKEN_COLORS.comment;
      }
      if (isQuotedToken(token)) return CODE_TOKEN_COLORS.string;
      return /^\d/.test(token)
        ? CODE_TOKEN_COLORS.number
        : CODE_TOKEN_COLORS.keyword;
    },
  },
};

const CODE_HIGHLIGHTER_ALIASES: Record<string, string> = {
  htm: "html",
  xml: "html",
  svg: "html",
  mjs: "js",
  cjs: "js",
  json: "js",
};

function highlightCode(value: string, filePath: string | null) {
  const extension = filePath?.split(".").pop()?.toLowerCase() ?? "";
  const highlighterKey = CODE_HIGHLIGHTER_ALIASES[extension] ?? extension;
  const highlighter = CODE_HIGHLIGHTERS[highlighterKey];

  return highlighter
    ? highlightWithRegex(value, highlighter.pattern, highlighter.classify)
    : value || " ";
}

type CodeWorkspaceTreeNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  file?: CodeWorkspaceArtifact["files"][number];
  children: CodeWorkspaceTreeNode[];
};

function buildCodeWorkspaceTree(files: CodeWorkspaceArtifact["files"]) {
  const root: CodeWorkspaceTreeNode = {
    name: "",
    path: "",
    type: "directory",
    children: [],
  };
  const matchesNode = (
    item: CodeWorkspaceTreeNode,
    part: string,
    expectedType: "file" | "directory",
  ) => item.name === part && item.type === expectedType;
  const findChild = (
    children: CodeWorkspaceTreeNode[],
    part: string,
    type: "file" | "directory",
  ) => {
    for (const item of children) {
      if (matchesNode(item, part, type)) return item;
    }
    return undefined;
  };
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;
    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      const isFile = pi === parts.length - 1;
      const nodePath = parts.slice(0, pi + 1).join("/");
      let child = findChild(
        current.children,
        part,
        isFile ? "file" : "directory",
      );
      if (!child) {
        child = {
          name: part,
          path: nodePath,
          type: isFile ? "file" : "directory",
          file: isFile ? file : undefined,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }
  const sortNodes = (nodes: CodeWorkspaceTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(root.children);
  return root.children;
}

function CodeWorkspaceFileTree({
  nodes,
  selectedPath,
  onSelect,
  level = 0,
}: {
  nodes: CodeWorkspaceTreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  level?: number;
}) {
  return (
    <div className={level === 0 ? "space-y-0.5" : undefined}>
      {nodes.map((node) => {
        if (node.type === "directory") {
          return (
            <div key={node.path}>
              <div
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground"
                style={{ paddingLeft: 8 + level * 12 }}
              >
                <FolderIcon className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{node.name}</span>
              </div>
              <CodeWorkspaceFileTree
                nodes={node.children}
                selectedPath={selectedPath}
                onSelect={onSelect}
                level={level + 1}
              />
            </div>
          );
        }
        return (
          <button
            key={node.path}
            type={BUTTON_TYPE}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted",
              selectedPath === node.path && "bg-muted text-foreground",
            )}
            style={{ paddingLeft: 8 + level * 12 }}
            onClick={() => onSelect(node.path)}
          >
            <FileIcon
              className="size-3 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {node.file ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/70">
                {node.file.binary ? "asset" : formatBytes(node.file.size)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function CodeWorkspaceEditor({
  value,
  filePath,
  disabled,
  onChange,
  className,
}: {
  value: string;
  filePath: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  const t = useTranslations("chat.artifacts");
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const highlighted = useMemo(
    () => highlightCode(value, filePath),
    [filePath, value],
  );

  function syncScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  return (
    <div
      className={cn(
        "relative min-h-[420px] flex-1 overflow-hidden bg-background",
        className,
      )}
    >
      <pre
        ref={highlightRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-auto p-3 font-mono text-[11px] leading-4 whitespace-pre text-foreground"
      >
        {highlighted}
      </pre>
      <textarea
        aria-label={
          filePath ? t("codeEditorFor", { path: filePath }) : t("codeEditor")
        }
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        disabled={disabled}
        spellCheck={false}
        wrap="off"
        className="absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent p-3 font-mono text-[11px] leading-4 text-transparent caret-foreground outline-none selection:bg-primary/20 focus:ring-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:opacity-70"
      />
    </div>
  );
}

type CodeWorkspaceArtifactEventDetail = {
  artifact: CodeWorkspaceArtifact;
  activate?: boolean;
};

function codeWorkspaceArtifactFromEvent(event: Event) {
  const detail = (event as CustomEvent<CodeWorkspaceArtifactEventDetail>)
    .detail;
  return detail?.artifact ?? null;
}

function dispatchCodeWorkspaceArtifact(
  artifact: CodeWorkspaceArtifact,
  options: { activate?: boolean } = {},
) {
  window.dispatchEvent(
    new CustomEvent<CodeWorkspaceArtifactEventDetail>(
      CODE_WORKSPACE_ARTIFACT_EVENT,
      {
        detail: { artifact, activate: options.activate },
      },
    ),
  );
}

export type WorkspaceArtifactDisplay = "full" | "summary";

export function CodeWorkspaceArtifactSummary({
  artifact,
}: {
  artifact: CodeWorkspaceArtifact;
}) {
  const t = useTranslations("chat.artifacts");
  return (
    <button
      type={BUTTON_TYPE}
      className="flex w-full items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-left text-xs transition-colors hover:bg-primary/10"
      onClick={() =>
        dispatchCodeWorkspaceArtifact(artifact, { activate: true })
      }
    >
      <FileIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">
          {artifact.title}
        </span>
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

type GitHubPublishOutput = {
  kind: "github_publish_result";
  mode: "pull_request" | "direct_push";
  repository: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitSha: string;
  pullRequestUrl: string | null;
  message: string;
};

export function GitHubPublishResultCard({
  result,
}: {
  result: GitHubPublishOutput;
}) {
  const t = useTranslations("chat.artifacts");
  return (
    <div className="w-fit max-w-full overflow-hidden rounded-xl border bg-card text-xs shadow-sm">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <GithubIcon className="size-4" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium text-foreground">{result.message}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {result.repository} ·{" "}
            {result.mode === "pull_request" ? "PR" : t("directPush")} ·{" "}
            {result.targetBranch}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
        <span>{t("commit", { sha: result.commitSha.slice(0, 7) })}</span>
        {result.pullRequestUrl ? (
          <a
            href={result.pullRequestUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            {t("openPr")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function ChatImageAttachmentCard({
  attachment,
}: {
  attachment: ChatImageAttachment;
}) {
  return (
    <Attachment orientation="vertical" className="w-[min(24rem,80vw)]">
      <AttachmentMedia variant="image" className="aspect-auto h-64">
        <a
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          role="img"
          aria-label={attachment.fileName}
          className="block h-64 w-full bg-contain bg-center bg-no-repeat"
          style={{
            backgroundImage: `url("${attachment.url.replace(/"/g, '\\"')}")`,
          }}
        />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
        <AttachmentDescription>
          {attachment.mimeType.replace("image/", "").toUpperCase()} ·{" "}
          {formatBytes(attachment.size)}
        </AttachmentDescription>
      </AttachmentContent>
    </Attachment>
  );
}

export function ChatFileAttachmentCard({
  attachment,
}: {
  attachment: ChatFileAttachment;
}) {
  const t = useTranslations("chat.artifacts");
  const tComposer = useTranslations("chat.composer");
  const canPreview = attachment.extractedTextChars > 0;
  const readLabel =
    attachment.extractionStatus === "unreadable"
      ? tComposer("storedSafely", { size: formatBytes(attachment.size) })
      : attachment.extractionStatus === "truncated"
        ? tComposer("partiallyRead")
        : tComposer("readable");
  const fileSummary = `${readLabel}${
    attachment.extractionStatus === "unreadable"
      ? ""
      : ` · ${formatBytes(attachment.size)}`
  }`;
  const preview = useFilePreview({
    attachmentId: attachment.id,
    canPreview,
  });

  return (
    <>
      <Attachment className="max-w-[min(28rem,84vw)]">
        <AttachmentMedia>
          <FileIcon aria-hidden="true" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
          <AttachmentDescription>
            {fileSummary}
            {attachment.extractedTextChars > 0
              ? ` · ${t("extractedChars", { count: attachment.extractedTextChars })}`
              : ""}
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          {canPreview ? (
            <AttachmentAction
              type="button"
              variant="outline"
              size="sm"
              onClick={preview.openPreview}
            >
              <Maximize2Icon data-icon="inline-start" aria-hidden="true" />
              {t("view")}
            </AttachmentAction>
          ) : null}
          <AttachmentAction asChild variant="ghost" size="sm">
            <a href={attachment.url} target="_blank" rel="noreferrer">
              <DownloadIcon data-icon="inline-start" aria-hidden="true" />
              {t("download")}
            </a>
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <FilePreviewDialog
        open={preview.previewOpen}
        onOpenChange={preview.setPreviewOpen}
        fileName={attachment.fileName}
        url={attachment.url}
        subtitle={
          `${fileSummary} · ` +
          t("extractedChars", { count: attachment.extractedTextChars })
        }
        previewText={preview.previewText}
        previewError={preview.previewError}
        loadingPreview={preview.loadingPreview}
      />
    </>
  );
}

export function CodeWorkspaceArtifactCard({
  artifact,
  workspaceId,
  variant = "card",
  activateOnMount = false,
}: {
  artifact: CodeWorkspaceArtifact;
  workspaceId?: string;
  variant?: "card" | "workbench";
  activateOnMount?: boolean;
}) {
  const t = useTranslations("chat.artifacts");
  const [currentArtifact, setCurrentArtifact] = useState(artifact);
  const [selectedPath, setSelectedPath] = useState<string | null>(
    artifact.rootFile ??
      artifact.files.find((file) => !file.binary)?.path ??
      null,
  );
  const [content, setContent] = useState("");
  const [fileReloadKey, setFileReloadKey] = useState(0);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenPane, setFullscreenPane] = useState<
    "code" | "preview" | null
  >(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const selectedFile = currentArtifact.files.find(
    (file) => file.path === selectedPath,
  );
  const fileTree = useMemo(
    () => buildCodeWorkspaceTree(currentArtifact.files),
    [currentArtifact.files],
  );

  useEffect(() => {
    dispatchCodeWorkspaceArtifact(artifact, { activate: activateOnMount });
    queueMicrotask(() => setCurrentArtifact(artifact));
  }, [activateOnMount, artifact]);

  useEffect(() => {
    function handleWorkspaceUpdate(event: Event) {
      const nextArtifact = codeWorkspaceArtifactFromEvent(event);
      if (nextArtifact?.projectId !== artifact.projectId) return;
      setCurrentArtifact((current) =>
        nextArtifact.version >= current.version ? nextArtifact : current,
      );
    }
    window.addEventListener(
      CODE_WORKSPACE_ARTIFACT_EVENT,
      handleWorkspaceUpdate,
    );
    return () => {
      window.removeEventListener(
        CODE_WORKSPACE_ARTIFACT_EVENT,
        handleWorkspaceUpdate,
      );
    };
  }, [artifact.projectId]);

  useEffect(() => {
    if (
      selectedPath &&
      currentArtifact.files.some((file) => file.path === selectedPath)
    ) {
      return;
    }
    queueMicrotask(() => {
      setSelectedPath(
        currentArtifact.rootFile ??
          currentArtifact.files.find((file) => !file.binary)?.path ??
          null,
      );
    });
  }, [currentArtifact, selectedPath]);

  useEffect(() => {
    if (!selectedPath || selectedFile?.binary) {
      queueMicrotask(() => setContent(""));
      return;
    }
    const filePath = selectedPath;
    let cancelled = false;
    async function loadSelectedFile() {
      setLoadingFile(true);
      setError(null);
      try {
        const fileContent = await loadCodeWorkspaceFileContent(
          currentArtifact.projectId,
          filePath,
          t("loadFileFailed"),
        );
        if (!cancelled) setContent(fileContent);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("loadFileFailed"),
          );
        }
      } finally {
        if (!cancelled) setLoadingFile(false);
      }
    }
    void loadSelectedFile();
    return () => {
      cancelled = true;
    };
  }, [
    currentArtifact.projectId,
    fileReloadKey,
    selectedFile?.binary,
    selectedPath,
    t,
  ]);

  async function saveSelectedFile() {
    if (!selectedPath || selectedFile?.binary) return;
    setSavingFile(true);
    setError(null);
    try {
      const nextArtifact = await requestUpdatedCodeWorkspaceArtifact(
        currentArtifact.projectId,
        "PUT",
        { path: selectedPath, content },
        t("saveFileFailed"),
      );
      setCurrentArtifact(nextArtifact);
      dispatchCodeWorkspaceArtifact(nextArtifact, { activate: true });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("saveFileFailed"),
      );
    } finally {
      setSavingFile(false);
    }
  }

  async function deleteSelectedFile() {
    if (!selectedPath) return;
    const confirmed = window.confirm(
      t("deleteFileConfirm", { path: selectedPath }),
    );
    if (!confirmed) return;
    setSavingFile(true);
    setError(null);
    try {
      const nextArtifact = await requestUpdatedCodeWorkspaceArtifact(
        currentArtifact.projectId,
        "DELETE",
        { path: selectedPath },
        t("deleteFileFailed"),
      );
      setCurrentArtifact(nextArtifact);
      dispatchCodeWorkspaceArtifact(nextArtifact, { activate: true });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("deleteFileFailed"),
      );
    } finally {
      setSavingFile(false);
    }
  }

  return (
    <>
      <GitHubPublishDialog
        artifact={currentArtifact}
        workspaceId={workspaceId}
        open={publishOpen}
        onOpenChangeAction={setPublishOpen}
      />
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-primary/20 bg-background text-xs shadow-sm",
          variant === "workbench" &&
            "flex h-full min-h-0 flex-col rounded-none border-0 shadow-none",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/35 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {currentArtifact.title}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t("workspaceSummary", {
                version: currentArtifact.version,
                count: currentArtifact.files.length,
              })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type={BUTTON_TYPE}
              variant={OUTLINE_VARIANT}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => setPublishOpen(true)}
            >
              <GithubIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
              GitHub
            </Button>
            <Button
              asChild
              type={BUTTON_TYPE}
              variant={OUTLINE_VARIANT}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
            >
              <a href={currentArtifact.downloadUrl}>
                <DownloadIcon
                  className={COMPACT_ICON_CLASS}
                  aria-hidden="true"
                />
                ZIP
              </a>
            </Button>
          </div>
        </div>
        {currentArtifact.message ? (
          <div className="border-b border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
            {currentArtifact.message}
          </div>
        ) : null}
        <div
          className={cn(
            "grid min-h-[520px] grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)_minmax(18rem,1fr)]",
            variant === "workbench" && "min-h-0 flex-1",
          )}
        >
          <div className="border-b border-border/50 bg-muted/20 lg:border-r lg:border-b-0">
            <div className="border-b border-border/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {t("files")}
            </div>
            <div className="max-h-64 overflow-auto p-2 lg:max-h-[480px]">
              <CodeWorkspaceFileTree
                nodes={fileTree}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-col border-b border-border/50 lg:border-r lg:border-b-0">
            <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {selectedPath ?? t("noFileSelected")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {selectedFile?.binary
                    ? t("binaryAsset")
                    : (selectedFile?.mimeType ?? t("selectFile"))}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type={BUTTON_TYPE}
                  variant={GHOST_VARIANT}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={!selectedPath || selectedFile?.binary}
                  onClick={() => setFullscreenPane("code")}
                  aria-label={t("fullscreen")}
                >
                  <Maximize2Icon
                    className={COMPACT_ICON_CLASS}
                    aria-hidden="true"
                  />
                </Button>
                <Button
                  type={BUTTON_TYPE}
                  variant={GHOST_VARIANT}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={
                    !selectedPath || selectedFile?.binary || loadingFile
                  }
                  onClick={() => setFileReloadKey((key) => key + 1)}
                  aria-label={t("refreshFile")}
                >
                  <RefreshCcwIcon
                    className={COMPACT_ICON_CLASS}
                    aria-hidden="true"
                  />
                </Button>
                <Button
                  type={BUTTON_TYPE}
                  variant={OUTLINE_VARIANT}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={!selectedPath || selectedFile?.binary || savingFile}
                  onClick={() => void saveSelectedFile()}
                >
                  <SaveIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                  {t("save")}
                </Button>
                <Button
                  type={BUTTON_TYPE}
                  variant={GHOST_VARIANT}
                  size="sm"
                  className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                  disabled={!selectedPath || savingFile}
                  onClick={() => void deleteSelectedFile()}
                  aria-label={t("deleteFile")}
                >
                  <Trash2Icon
                    className={COMPACT_ICON_CLASS}
                    aria-hidden="true"
                  />
                </Button>
              </div>
            </div>
            {error ? (
              <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                {error}
              </div>
            ) : null}
            {selectedFile?.binary ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
                {t("binaryDescription")}
              </div>
            ) : (
              <CodeWorkspaceEditor
                value={loadingFile ? t("loadingFile") : content}
                filePath={selectedPath}
                disabled={!selectedPath || loadingFile || savingFile}
                onChange={setContent}
              />
            )}
          </div>
          <div className="flex min-w-0 flex-col bg-white">
            <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/40 bg-background px-3 py-2">
              <div>
                <p className="font-medium text-foreground">
                  {t("livePreview")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {currentArtifact.rootFile ?? t("noHtmlEntry")}
                </p>
              </div>
              <Button
                type={BUTTON_TYPE}
                variant={GHOST_VARIANT}
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={!currentArtifact.rootFile}
                onClick={() => setFullscreenPane("preview")}
              >
                <Maximize2Icon
                  className={COMPACT_ICON_CLASS}
                  aria-hidden="true"
                />
                {t("fullscreen")}
              </Button>
            </div>
            <CodeWorkspacePreviewFrame
              key={`${currentArtifact.projectId}:${currentArtifact.version}:${currentArtifact.rootFile ?? "no-root"}`}
              artifact={currentArtifact}
            />
          </div>
        </div>
        <Dialog
          open={fullscreenPane !== null}
          onOpenChange={(open) => !open && setFullscreenPane(null)}
        >
          <DialogContent className="!fixed !inset-0 flex !h-dvh !w-full !translate-x-0 !translate-y-0 flex-col overflow-hidden !rounded-none !border-0 bg-background p-0 sm:!max-w-none">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-semibold">
                  {fullscreenPane === "preview"
                    ? t("livePreview")
                    : (selectedPath ?? t("code"))}
                </DialogTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {currentArtifact.title} · v{currentArtifact.version}
                </p>
              </div>
              {fullscreenPane === "code" ? (
                <Button
                  type={BUTTON_TYPE}
                  variant={OUTLINE_VARIANT}
                  size="sm"
                  disabled={!selectedPath || selectedFile?.binary || savingFile}
                  onClick={() => void saveSelectedFile()}
                >
                  <SaveIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                  {t("save")}
                </Button>
              ) : null}
            </div>
            {fullscreenPane === "preview" ? (
              <div className="flex min-h-0 flex-1 bg-white">
                <CodeWorkspacePreviewFrame
                  key={`fullscreen:${currentArtifact.projectId}:${currentArtifact.version}:${currentArtifact.rootFile ?? "no-root"}`}
                  artifact={currentArtifact}
                />
              </div>
            ) : null}
            {fullscreenPane === "code" ? (
              <CodeWorkspaceEditor
                value={loadingFile ? t("loadingFile") : content}
                filePath={selectedPath}
                disabled={!selectedPath || loadingFile || savingFile}
                onChange={setContent}
                className="min-h-0 flex-1"
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
