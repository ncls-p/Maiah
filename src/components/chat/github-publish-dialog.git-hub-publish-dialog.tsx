"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import {
  GitHubBranchOption,
  GitHubConnectionOption,
  GitHubPublishResult,
  GitHubRepositoryOption,
  GitHubStatusPayload,
  canAttemptPublishToRepository,
  requestGitHubJson,
} from "./github-publish-dialog.button-type";
import { GitHubPublishDialogView } from "./github-publish-dialog.git-hub-publish-dialog.view";

export function useGitHubPublishDialogController({
  artifact,
  workspaceId,
  open,
  onOpenChangeAction,
}: {
  artifact: CodeWorkspaceArtifact;
  workspaceId?: string;
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("chat.github");
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [connections, setConnections] = useState<GitHubConnectionOption[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepositoryOption[]>(
    [],
  );
  const [syncing, setSyncing] = useState(false);
  const [branches, setBranches] = useState<GitHubBranchOption[]>([]);
  const [repositoryId, setRepositoryId] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetDirectory, setTargetDirectory] = useState("");
  const [mode, setMode] = useState<"pull_request" | "direct_push">(
    "pull_request",
  );
  const [commitMessage, setCommitMessage] = useState(t("defaultCommit"));
  const [confirmDirectPush, setConfirmDirectPush] = useState(false);
  const [result, setResult] = useState<GitHubPublishResult | null>(null);
  const selectedRepository = repositories.find(
    (repo) => repo.id === repositoryId,
  );
  const selectedConnection = selectedRepository
    ? connections.find(
        (connection) => connection.id === selectedRepository.connectionId,
      )
    : null;
  const primaryManageUrl =
    selectedConnection?.settingsUrl ??
    connections[0]?.settingsUrl ??
    connectUrl;
  const canPublishToSelectedRepository = selectedRepository
    ? canAttemptPublishToRepository(selectedRepository.access)
    : false;

  const applyGitHubStatus = useCallback((data: GitHubStatusPayload) => {
    setConfigured(Boolean(data.configured));
    setConnectUrl(data.connectPath ?? data.connectUrl ?? null);
    const nextConnections = data.connections ?? [];
    const nextRepos = data.repositories ?? [];
    setConnections(nextConnections);
    setRepositories(nextRepos);
    setRepositoryId((current) =>
      nextRepos.some((repo) => repo.id === current)
        ? current
        : nextRepos[0]?.id || "",
    );
    setTargetBranch(
      (current) => current || nextRepos[0]?.defaultBranch || "main",
    );
  }, []);

  useEffect(() => {
    if (!open || !workspaceId) return;
    const currentWorkspaceId = workspaceId;
    let cancelled = false;
    async function loadStatus() {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const data = await requestGitHubJson<GitHubStatusPayload>(
          `/api/workspace/github/status?workspaceId=${encodeURIComponent(currentWorkspaceId)}`,
          undefined,
          t("unavailable"),
        );
        if (cancelled) return;
        applyGitHubStatus(data ?? {});
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : t("loadFailed"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [applyGitHubStatus, open, t, workspaceId]);

  useEffect(() => {
    if (!open) return;
    if (!workspaceId) return;
    if (!repositoryId) return;
    const currentWorkspaceId = workspaceId;
    let cancelled = false;
    async function loadBranches() {
      try {
        const data = await requestGitHubJson<{
          branches?: GitHubBranchOption[];
          error?: string;
        }>(
          `/api/workspace/github/branches?workspaceId=${encodeURIComponent(currentWorkspaceId)}&repositoryId=${encodeURIComponent(repositoryId)}`,
          undefined,
          t("branchesFailed"),
        );
        if (cancelled) return;
        const nextBranches = data?.branches ?? [];
        setBranches(nextBranches);
        const selected = repositories.find((repo) => repo.id === repositoryId);
        setTargetBranch((current) =>
          current && nextBranches.some((branch) => branch.name === current)
            ? current
            : selected?.defaultBranch || nextBranches[0]?.name || "main",
        );
      } catch (loadError) {
        if (!cancelled) {
          setBranches([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("branchesFailed"),
          );
        }
      }
    }
    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, [open, repositories, repositoryId, t, workspaceId]);

  async function syncRepositories(connectionId?: string) {
    if (!workspaceId) return;
    setSyncing(true);
    setError(null);
    try {
      const data = await requestGitHubJson<GitHubStatusPayload>(
        "/api/workspace/github/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, connectionId }),
        },
        t("syncFailed"),
      );
      applyGitHubStatus(data ?? {});
    } catch (syncError) {
      setError(
        syncError instanceof Error ? syncError.message : t("syncFailed"),
      );
    } finally {
      setSyncing(false);
    }
  }

  async function publish() {
    if (!workspaceId) return;
    if (!repositoryId) return;
    if (!targetBranch.trim()) return;
    if (!canPublishToSelectedRepository) {
      setError(t("writeAccessRequired"));
      return;
    }
    if (mode === "direct_push" && !confirmDirectPush) {
      setError(t("directPushRequired"));
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const data = await requestGitHubJson<{
        result?: GitHubPublishResult;
        error?: string;
      }>(
        "/api/workspace/github/publish",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            projectId: artifact.projectId,
            repositoryId,
            mode,
            targetBranch,
            sourceBranch: sourceBranch.trim() || undefined,
            targetDirectory: targetDirectory.trim() || undefined,
            commitMessage: commitMessage.trim(),
            pullRequestTitle: commitMessage.trim(),
            confirmDirectPush,
          }),
        },
        t("publishFailed"),
      );
      if (!data?.result) {
        throw new Error(data?.error || t("publishFailed"));
      }
      setResult(data.result);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : t("publishFailed"),
      );
    } finally {
      setPublishing(false);
    }
  }

  return {
    kind: "ready",
    artifact,
    branches,
    canPublishToSelectedRepository,
    commitMessage,
    configured,
    confirmDirectPush,
    connectUrl,
    connections,
    error,
    loading,
    locale,
    mode,
    onOpenChangeAction,
    open,
    primaryManageUrl,
    publish,
    publishing,
    repositories,
    repositoryId,
    result,
    selectedConnection,
    selectedRepository,
    setCommitMessage,
    setConfirmDirectPush,
    setMode,
    setRepositoryId,
    setSourceBranch,
    setTargetBranch,
    setTargetDirectory,
    sourceBranch,
    syncRepositories,
    syncing,
    t,
    targetBranch,
    targetDirectory,
    workspaceId,
  } as const;
}

export function GitHubPublishDialog(
  ...args: Parameters<typeof useGitHubPublishDialogController>
) {
  const model = useGitHubPublishDialogController(...args);
  if (!("kind" in model)) return model;
  return <GitHubPublishDialogView model={model} />;
}
