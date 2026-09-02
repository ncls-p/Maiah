"use client";

import { useLocale } from "next-intl";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import {
  codeWorkspaceWindowUrl,
  openCodeWorkspaceWindow,
} from "./code-workspace-artifact-card.button-type";

/**
 * Lets the preview and the editor of a code workspace live in their own
 * browser windows (second screen, side by side with the chat, ...).
 */
export function useCodeWorkspacePopoutWindows({
  artifact,
  workspaceId,
  selectedPath,
  standalone,
}: {
  artifact: CodeWorkspaceArtifact;
  workspaceId?: string;
  selectedPath: string | null;
  standalone: boolean;
}) {
  const locale = useLocale();

  // The preview pop-out is an app page hosting the same sandboxed frame as the
  // workbench: the raw preview route needs the session cookie, which sandboxed
  // sub-resource requests (CSS, JS, images) would not carry.
  function openPreviewWindow() {
    if (!artifact.rootFile) return;
    openCodeWorkspaceWindow(
      codeWorkspaceWindowUrl(locale, artifact, {
        surface: "preview",
        workspaceId,
      }),
      `maiah-code-preview-${artifact.projectId}`,
    );
  }

  function openEditorWindow() {
    openCodeWorkspaceWindow(
      codeWorkspaceWindowUrl(locale, artifact, {
        workspaceId,
        path: selectedPath,
      }),
      `maiah-code-workspace-${artifact.projectId}`,
    );
  }

  return {
    canOpenPreviewWindow: Boolean(artifact.rootFile),
    // A pop-out window should not offer to pop itself out again.
    canOpenEditorWindow: !standalone,
    openEditorWindow,
    openPreviewWindow,
  };
}
