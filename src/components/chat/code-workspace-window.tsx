"use client";

import { Loader2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import { CodeWorkspaceArtifactCard } from "@/components/chat/code-workspace-artifact-card";
import { CodeWorkspacePreviewFrame } from "@/components/chat/code-workspace-preview-frame";
import { Button } from "@/components/ui/button";
import {
  isCodeWorkspaceArtifactOutput,
  subscribeToCodeWorkspaceArtifacts,
  type CodeWorkspaceWindowSurface,
} from "./code-workspace-artifact-card.button-type";

type WindowState =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string | null }
  | { kind: "ready"; artifact: CodeWorkspaceArtifact };

/**
 * Standalone surface rendered by the `/code-workspace/[projectId]` pop-out
 * routes: the full workbench (files, editor, preview) or the preview alone, in
 * its own browser window.
 */
export function CodeWorkspaceWindow({
  projectId,
  workspaceId,
  initialPath,
  surface,
}: {
  projectId: string;
  workspaceId?: string;
  initialPath: string | null;
  surface: CodeWorkspaceWindowSurface;
}) {
  const t = useTranslations("chat.artifacts");
  const locale = useLocale();
  const [state, setState] = useState<WindowState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/workspace/code-projects/${projectId}/files`,
      );
      if (response.status === 401) {
        setState({ kind: "unauthenticated" });
        return;
      }
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isCodeWorkspaceArtifactOutput(data)) {
        const message =
          data && typeof data === "object" && "error" in data
            ? String((data as { error?: unknown }).error ?? "")
            : "";
        setState({ kind: "error", message: message || null });
        return;
      }
      setState({ kind: "ready", artifact: data });
    } catch {
      setState({ kind: "error", message: null });
    }
  }, [projectId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  function retry() {
    setState({ kind: "loading" });
    void load();
  }

  useEffect(() => {
    if (state.kind !== "ready") return;
    document.title = `${state.artifact.title} · ${t(
      surface === "preview" ? "livePreview" : "popoutTitle",
    )}`;
  }, [state, surface, t]);

  // Saves made in the chat or in another pop-out refresh this window too.
  useEffect(
    () =>
      subscribeToCodeWorkspaceArtifacts(projectId, (artifact) => {
        setState((current) =>
          current.kind === "ready" &&
          artifact.version > current.artifact.version
            ? { kind: "ready", artifact }
            : current,
        );
      }),
    [projectId],
  );

  if (state.kind === "ready" && surface === "preview") {
    const artifact = state.artifact;
    return (
      <div
        className="flex h-full min-h-0 flex-col bg-white"
        data-slot="code-workspace-preview-window"
      >
        <CodeWorkspacePreviewFrame
          key={`popout:${artifact.projectId}:${artifact.version}:${artifact.rootFile ?? "no-root"}`}
          artifact={artifact}
        />
      </div>
    );
  }

  if (state.kind === "ready") {
    return (
      <div
        className="flex h-full min-h-0 flex-col"
        data-slot="code-workspace-window"
      >
        <CodeWorkspaceArtifactCard
          artifact={state.artifact}
          workspaceId={workspaceId}
          variant="workbench"
          standalone
          initialPath={initialPath}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {state.kind === "loading" ? (
        <p className="flex items-center gap-2">
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          {t("popoutLoading")}
        </p>
      ) : null}
      {state.kind === "unauthenticated" ? (
        <div className="space-y-3">
          <p>{t("popoutSignIn")}</p>
          <Button asChild size="sm" variant="outline">
            <a href={`/${locale}/auth/signin`}>{t("popoutSignIn")}</a>
          </Button>
        </div>
      ) : null}
      {state.kind === "error" ? (
        <div className="space-y-3">
          <p className="text-destructive">
            {state.message ?? t("popoutLoadFailed")}
          </p>
          <Button size="sm" variant="outline" onClick={retry}>
            {t("popoutRetry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
