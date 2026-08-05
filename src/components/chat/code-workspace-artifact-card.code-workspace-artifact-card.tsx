"use client";

import { Code2Icon,DownloadIcon,EyeIcon,FileIcon,Maximize2Icon,RefreshCcwIcon,SaveIcon,Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { useEffect,useId,useMemo,useState } from "react";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import { DEFAULT_CODE_WORKSPACE_LAYOUT,MAX_CODE_WIDTH,MAX_FILES_WIDTH,MIN_CODE_WIDTH,MIN_FILES_WIDTH,codeWorkspaceGridTemplate,normalizeCodeWorkspaceLayout,resizeCodeWorkspacePane,toggleCodeWorkspacePane,visibleCodeWorkspacePanes,type CodeWorkspaceLayout,type CodeWorkspacePane } from "@/components/chat/code-workspace-layout";
import { CodeWorkspacePreviewFrame } from "@/components/chat/code-workspace-preview-frame";
import { GitHubPublishDialog } from "@/components/chat/github-publish-dialog";
import { ToolStateIcon } from "@/components/chat/tool-state-icon";
import { DestructiveConfirmationDialog } from "@/components/destructive-confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BUTTON_TYPE,CODE_WORKSPACE_ARTIFACT_EVENT,CODE_WORKSPACE_LAYOUT_STORAGE_KEY,COMPACT_ICON_CLASS,CodeWorkspaceResizeHandle,GHOST_VARIANT,GithubIcon,OUTLINE_VARIANT,loadCodeWorkspaceFileContent,requestUpdatedCodeWorkspaceArtifact } from "./code-workspace-artifact-card.button-type";
import { CodeWorkspaceEditor,CodeWorkspaceFileTree,codeWorkspaceArtifactFromEvent,dispatchCodeWorkspaceArtifact } from "./code-workspace-artifact-card.code-workspace-file-tree";
import { buildCodeWorkspaceTree } from "./code-workspace-artifact-card.highlight-code";

export function CodeWorkspaceArtifactCard({ artifact, workspaceId, variant = "card", activateOnMount = false }: { artifact: CodeWorkspaceArtifact; workspaceId?: string; variant?: "card" | "workbench"; activateOnMount?: boolean }) {
  const t = useTranslations("chat.artifacts");
  const [currentArtifact, setCurrentArtifact] = useState(artifact);
  const [selectedPath, setSelectedPath] = useState<string | null>(artifact.rootFile ?? artifact.files.find((file) => !file.binary)?.path ?? null);
  const [content, setContent] = useState("");
  const [fileReloadKey, setFileReloadKey] = useState(0);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenPane, setFullscreenPane] = useState<"code" | "preview" | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deletePath, setDeletePath] = useState<string | null>(null);
  const [workspaceLayout, setWorkspaceLayout] = useState<CodeWorkspaceLayout>(DEFAULT_CODE_WORKSPACE_LAYOUT);
  const paneIdPrefix = useId();
  const selectedFile = currentArtifact.files.find((file) => file.path === selectedPath);
  const fileTree = useMemo(() => buildCodeWorkspaceTree(currentArtifact.files), [currentArtifact.files]);
  const visiblePanes = visibleCodeWorkspacePanes(workspaceLayout);
  const workspaceGridTemplate = codeWorkspaceGridTemplate(workspaceLayout);

  function paneId(pane: CodeWorkspacePane) {
    return `${paneIdPrefix}-${pane}`;
  }

  function updateWorkspaceLayout(updater: (current: CodeWorkspaceLayout) => CodeWorkspaceLayout) {
    setWorkspaceLayout((current) => {
      const next = updater(current);
      try {
        window.localStorage.setItem(CODE_WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The layout still works for this session when storage is unavailable.
      }
      return next;
    });
  }

  useEffect(() => {
    if (variant !== "workbench") return;
    try {
      const persisted = window.localStorage.getItem(CODE_WORKSPACE_LAYOUT_STORAGE_KEY);
      if (!persisted) return;
      const next = normalizeCodeWorkspaceLayout(JSON.parse(persisted));
      queueMicrotask(() => setWorkspaceLayout(next));
    } catch {
      // Ignore malformed or unavailable local storage and keep safe defaults.
    }
  }, [variant]);

  useEffect(() => {
    dispatchCodeWorkspaceArtifact(artifact, { activate: activateOnMount });
    queueMicrotask(() => setCurrentArtifact(artifact));
  }, [activateOnMount, artifact]);

  useEffect(() => {
    function handleWorkspaceUpdate(event: Event) {
      const nextArtifact = codeWorkspaceArtifactFromEvent(event);
      if (nextArtifact?.projectId !== artifact.projectId) return;
      setCurrentArtifact((current) => (nextArtifact.version >= current.version ? nextArtifact : current));
    }
    window.addEventListener(CODE_WORKSPACE_ARTIFACT_EVENT, handleWorkspaceUpdate);
    return () => {
      window.removeEventListener(CODE_WORKSPACE_ARTIFACT_EVENT, handleWorkspaceUpdate);
    };
  }, [artifact.projectId]);

  useEffect(() => {
    if (selectedPath && currentArtifact.files.some((file) => file.path === selectedPath)) {
      return;
    }
    queueMicrotask(() => {
      setSelectedPath(currentArtifact.rootFile ?? currentArtifact.files.find((file) => !file.binary)?.path ?? null);
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
        const fileContent = await loadCodeWorkspaceFileContent(currentArtifact.projectId, filePath, t("loadFileFailed"));
        if (!cancelled) setContent(fileContent);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : t("loadFileFailed"));
        }
      } finally {
        if (!cancelled) setLoadingFile(false);
      }
    }
    void loadSelectedFile();
    return () => {
      cancelled = true;
    };
  }, [currentArtifact.projectId, fileReloadKey, selectedFile?.binary, selectedPath, t]);

  async function saveSelectedFile() {
    if (!selectedPath || selectedFile?.binary) return;
    setSavingFile(true);
    setError(null);
    try {
      const nextArtifact = await requestUpdatedCodeWorkspaceArtifact(currentArtifact.projectId, "PUT", { path: selectedPath, content }, t("saveFileFailed"));
      setCurrentArtifact(nextArtifact);
      dispatchCodeWorkspaceArtifact(nextArtifact, { activate: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("saveFileFailed"));
    } finally {
      setSavingFile(false);
    }
  }

  async function deleteSelectedFile() {
    if (!deletePath) return;
    setSavingFile(true);
    setError(null);
    try {
      const nextArtifact = await requestUpdatedCodeWorkspaceArtifact(currentArtifact.projectId, "DELETE", { path: deletePath }, t("deleteFileFailed"));
      setCurrentArtifact(nextArtifact);
      dispatchCodeWorkspaceArtifact(nextArtifact, { activate: true });
      setDeletePath(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("deleteFileFailed"));
    } finally {
      setSavingFile(false);
    }
  }

  return (
    <>
      <GitHubPublishDialog artifact={currentArtifact} workspaceId={workspaceId} open={publishOpen} onOpenChangeAction={setPublishOpen} />
      <div className={cn("overflow-hidden rounded-2xl bg-card text-xs shadow-[var(--surface-shadow)]", variant === "workbench" && "flex h-full min-h-0 flex-col rounded-none border-0 shadow-none")}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-2.5 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <ToolStateIcon state="completed" />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{currentArtifact.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {t("workspaceSummary", {
                  version: currentArtifact.version,
                  count: currentArtifact.files.length,
                })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {variant === "workbench" ? (
              <div aria-label={t("workspacePanels")} className="flex items-center gap-0.5 rounded-xl border border-border/50 bg-muted/35 p-0.5" role="group">
                {(
                  [
                    ["files", FileIcon, t("files")],
                    ["code", Code2Icon, t("code")],
                    ["preview", EyeIcon, t("preview")],
                  ] as const
                ).map(([pane, Icon, label]) => {
                  const visible = workspaceLayout.visible[pane];
                  const actionLabel = visible ? t("hideWorkspacePane", { pane: label }) : t("showWorkspacePane", { pane: label });
                  return (
                    <Button key={pane} aria-controls={paneId(pane)} aria-label={actionLabel} aria-pressed={visible} className={cn("h-10 rounded-[10px] px-2.5 text-[11px] transition-[background-color,color,box-shadow,transform]", visible && "bg-background text-foreground shadow-sm")} onClick={() => updateWorkspaceLayout((current) => toggleCodeWorkspacePane(current, pane))} size="sm" title={actionLabel} type={BUTTON_TYPE} variant={GHOST_VARIANT}>
                      <Icon className="size-3.5" aria-hidden="true" />
                      <span className="hidden 2xl:inline">{label}</span>
                    </Button>
                  );
                })}
              </div>
            ) : null}
            <Button type={BUTTON_TYPE} variant={OUTLINE_VARIANT} size="sm" className="h-10 rounded-xl px-3 text-[11px]" onClick={() => setPublishOpen(true)}>
              <GithubIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
              GitHub
            </Button>
            <Button asChild type={BUTTON_TYPE} variant={OUTLINE_VARIANT} size="sm" className="h-10 rounded-xl px-3 text-[11px]">
              <a href={currentArtifact.downloadUrl}>
                <DownloadIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                ZIP
              </a>
            </Button>
          </div>
        </div>
        {currentArtifact.message ? <div className="border-b border-border/40 px-3 py-2 text-[11px] text-muted-foreground">{currentArtifact.message}</div> : null}
        <div
          className={cn("grid min-h-[520px] grid-cols-1", variant === "workbench" ? "min-h-0 flex-1 overflow-y-auto lg:overflow-hidden lg:[grid-template-columns:var(--workspace-grid-template)]" : "lg:grid-cols-[13rem_minmax(0,1fr)_minmax(18rem,1fr)]")}
          style={
            variant === "workbench"
              ? ({
                  "--workspace-grid-template": workspaceGridTemplate,
                } as React.CSSProperties)
              : undefined
          }
        >
          {variant !== "workbench" || workspaceLayout.visible.files ? (
            <div className={cn("flex min-w-0 flex-col border-b border-border/50 bg-muted/20 lg:border-b-0", variant === "workbench" && "min-h-[24rem] lg:min-h-0", variant !== "workbench" && "lg:border-r")} id={paneId("files")}>
              <div className="border-b border-border/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t("files")}</div>
              <div className={cn("overflow-auto p-2", variant === "workbench" ? "min-h-0 flex-1" : "max-h-64 lg:max-h-[480px]")}>
                <CodeWorkspaceFileTree nodes={fileTree} selectedPath={selectedPath} onSelect={setSelectedPath} />
              </div>
            </div>
          ) : null}
          {variant === "workbench" && workspaceLayout.visible.files && (workspaceLayout.visible.code || workspaceLayout.visible.preview) ? <CodeWorkspaceResizeHandle controls={paneId("files")} label={t("resizeFilesPane")} maximum={MAX_FILES_WIDTH} minimum={MIN_FILES_WIDTH} onResize={(width) => updateWorkspaceLayout((current) => resizeCodeWorkspacePane(current, "files", width))} value={workspaceLayout.filesWidth} /> : null}
          {variant !== "workbench" || workspaceLayout.visible.code ? (
            <div className={cn("flex min-w-0 flex-col border-b border-border/50 lg:border-b-0", variant === "workbench" && "min-h-[24rem] lg:min-h-0", variant !== "workbench" && "lg:border-r")} id={paneId("code")}>
              <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{selectedPath ?? t("noFileSelected")}</p>
                  <p className="text-[10px] text-muted-foreground">{selectedFile?.binary ? t("binaryAsset") : (selectedFile?.mimeType ?? t("selectFile"))}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button type={BUTTON_TYPE} variant={GHOST_VARIANT} size="sm" className="h-7 px-2 text-[11px]" disabled={!selectedPath || selectedFile?.binary} onClick={() => setFullscreenPane("code")} aria-label={t("fullscreen")}>
                    <Maximize2Icon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                  </Button>
                  <Button type={BUTTON_TYPE} variant={GHOST_VARIANT} size="sm" className="h-7 px-2 text-[11px]" disabled={!selectedPath || selectedFile?.binary || loadingFile} onClick={() => setFileReloadKey((key) => key + 1)} aria-label={t("refreshFile")}>
                    <RefreshCcwIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                  </Button>
                  <Button type={BUTTON_TYPE} variant={OUTLINE_VARIANT} size="sm" className="h-7 px-2 text-[11px]" disabled={!selectedPath || selectedFile?.binary || savingFile} onClick={() => void saveSelectedFile()}>
                    <SaveIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                    {t("save")}
                  </Button>
                  <Button type={BUTTON_TYPE} variant={GHOST_VARIANT} size="sm" className="h-7 px-2 text-[11px] text-destructive hover:text-destructive" disabled={!selectedPath || savingFile} onClick={() => setDeletePath(selectedPath)} aria-label={t("deleteFile")}>
                    <Trash2Icon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {error ? <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">{error}</div> : null}
              {selectedFile?.binary ? <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">{t("binaryDescription")}</div> : <CodeWorkspaceEditor value={loadingFile ? t("loadingFile") : content} filePath={selectedPath} disabled={!selectedPath || loadingFile || savingFile} onChange={setContent} />}
            </div>
          ) : null}
          {variant === "workbench" && workspaceLayout.visible.code && workspaceLayout.visible.preview ? <CodeWorkspaceResizeHandle controls={paneId("code")} label={t("resizeCodePane")} maximum={MAX_CODE_WIDTH} minimum={MIN_CODE_WIDTH} onResize={(width) => updateWorkspaceLayout((current) => resizeCodeWorkspacePane(current, "code", width))} value={workspaceLayout.codeWidth} /> : null}
          {variant !== "workbench" || workspaceLayout.visible.preview ? (
            <div className={cn("flex min-w-0 flex-col bg-white", variant === "workbench" && "min-h-[24rem] lg:min-h-0")} id={paneId("preview")}>
              <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/40 bg-background px-3 py-2">
                <div>
                  <p className="font-medium text-foreground">{t("livePreview")}</p>
                  <p className="text-[10px] text-muted-foreground">{currentArtifact.rootFile ?? t("noHtmlEntry")}</p>
                </div>
                <Button type={BUTTON_TYPE} variant={GHOST_VARIANT} size="sm" className="h-7 px-2 text-[11px]" disabled={!currentArtifact.rootFile} onClick={() => setFullscreenPane("preview")}>
                  <Maximize2Icon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                  {t("fullscreen")}
                </Button>
              </div>
              <CodeWorkspacePreviewFrame key={`${currentArtifact.projectId}:${currentArtifact.version}:${currentArtifact.rootFile ?? "no-root"}`} artifact={currentArtifact} />
            </div>
          ) : null}
          {variant === "workbench" && visiblePanes.length === 0 ? (
            <div className="flex min-h-80 items-center justify-center p-6 text-center">
              <div className="max-w-xs rounded-2xl border border-border/60 bg-muted/20 p-5 shadow-sm">
                <p className="text-sm font-medium text-foreground">{t("allWorkspacePanesHidden")}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("allWorkspacePanesHiddenDescription")}</p>
                <Button
                  className="mt-4 h-10 rounded-xl"
                  onClick={() =>
                    updateWorkspaceLayout((current) => ({
                      ...current,
                      visible: { files: true, code: true, preview: true },
                    }))
                  }
                  size="sm"
                  type={BUTTON_TYPE}
                  variant={OUTLINE_VARIANT}
                >
                  {t("showAllWorkspacePanes")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        <Dialog open={fullscreenPane !== null} onOpenChange={(open) => !open && setFullscreenPane(null)}>
          <DialogContent className="!fixed !inset-0 flex !h-dvh !w-full !translate-x-0 !translate-y-0 flex-col overflow-hidden !rounded-none !border-0 bg-background p-0 sm:!max-w-none">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-semibold">{fullscreenPane === "preview" ? t("livePreview") : (selectedPath ?? t("code"))}</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                  {currentArtifact.title} · v{currentArtifact.version}
                </DialogDescription>
              </div>
              {fullscreenPane === "code" ? (
                <Button type={BUTTON_TYPE} variant={OUTLINE_VARIANT} size="sm" disabled={!selectedPath || selectedFile?.binary || savingFile} onClick={() => void saveSelectedFile()}>
                  <SaveIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                  {t("save")}
                </Button>
              ) : null}
            </div>
            {fullscreenPane === "preview" ? (
              <div className="flex min-h-0 flex-1 bg-white">
                <CodeWorkspacePreviewFrame key={`fullscreen:${currentArtifact.projectId}:${currentArtifact.version}:${currentArtifact.rootFile ?? "no-root"}`} artifact={currentArtifact} />
              </div>
            ) : null}
            {fullscreenPane === "code" ? <CodeWorkspaceEditor value={loadingFile ? t("loadingFile") : content} filePath={selectedPath} disabled={!selectedPath || loadingFile || savingFile} onChange={setContent} className="min-h-0 flex-1" /> : null}
          </DialogContent>
        </Dialog>
      </div>
      <DestructiveConfirmationDialog
        open={deletePath !== null}
        title={t("deleteFile")}
        description={t("deleteFileConfirm", { path: deletePath ?? "" })}
        cancelLabel={t("cancel")}
        confirmLabel={savingFile ? t("deletingFile") : t("deleteFile")}
        busy={savingFile}
        onOpenChange={(open) => {
          if (!open && !savingFile) setDeletePath(null);
        }}
        onConfirm={() => void deleteSelectedFile()}
      />
    </>
  );
}
