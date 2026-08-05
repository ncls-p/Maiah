"use client";

import { useTranslations } from "next-intl";
import { useEffect,useId,useMemo,useState } from "react";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import { DEFAULT_CODE_WORKSPACE_LAYOUT,codeWorkspaceGridTemplate,normalizeCodeWorkspaceLayout,visibleCodeWorkspacePanes,type CodeWorkspaceLayout,type CodeWorkspacePane } from "@/components/chat/code-workspace-layout";
import { CODE_WORKSPACE_ARTIFACT_EVENT,CODE_WORKSPACE_LAYOUT_STORAGE_KEY,loadCodeWorkspaceFileContent,requestUpdatedCodeWorkspaceArtifact } from "./code-workspace-artifact-card.button-type";
import { CodeWorkspaceArtifactCardView } from "./code-workspace-artifact-card.code-workspace-artifact-card.view";
import { codeWorkspaceArtifactFromEvent,dispatchCodeWorkspaceArtifact } from "./code-workspace-artifact-card.code-workspace-file-tree";
import { buildCodeWorkspaceTree } from "./code-workspace-artifact-card.highlight-code";

export function useCodeWorkspaceArtifactCardController({ artifact, workspaceId, variant = "card", activateOnMount = false }: { artifact: CodeWorkspaceArtifact; workspaceId?: string; variant?: "card" | "workbench"; activateOnMount?: boolean }) {
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

  return {
    kind: "ready",
    content,
    currentArtifact,
    deletePath,
    deleteSelectedFile,
    error,
    fileTree,
    fullscreenPane,
    loadingFile,
    paneId,
    publishOpen,
    saveSelectedFile,
    savingFile,
    selectedFile,
    selectedPath,
    setContent,
    setDeletePath,
    setFileReloadKey,
    setFullscreenPane,
    setPublishOpen,
    setSelectedPath,
    t,
    updateWorkspaceLayout,
    variant,
    visiblePanes,
    workspaceGridTemplate,
    workspaceId,
    workspaceLayout,
  } as const;
}

export function CodeWorkspaceArtifactCard(...args: Parameters<typeof useCodeWorkspaceArtifactCardController>) {
  const model = useCodeWorkspaceArtifactCardController(...args);
  if (!("kind" in model)) return model;
  return <CodeWorkspaceArtifactCardView model={model} />;
}
