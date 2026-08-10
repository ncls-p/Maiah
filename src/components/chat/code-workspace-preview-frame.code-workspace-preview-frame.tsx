"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import {
  buildPreviewSrcDoc,
  escapeClosingTags,
  escapeHtmlAttribute,
  fetchCodeWorkspaceTextFile,
  hasWorkspaceTextFile,
  htmlAttributeValue,
  metaRefreshTarget,
  normalizeWorkspaceHref,
  replacePreviewMatches,
} from "./code-workspace-preview-frame.escape-closing-tags";

async function inlineLocalPreviewStyles(
  html: string,
  artifact: CodeWorkspaceArtifact,
  path: string,
) {
  return replacePreviewMatches(html, /<link\b[^>]*>/gi, async (match) => {
    const tag = match[0];
    const rel = htmlAttributeValue(tag, "rel")?.toLowerCase() ?? "";
    if (!rel.split(/\s+/).includes("stylesheet")) return tag;
    const href = htmlAttributeValue(tag, "href");
    const stylesheetPath = href ? normalizeWorkspaceHref(path, href) : null;
    if (!stylesheetPath) return tag;
    if (!hasWorkspaceTextFile(artifact.files, stylesheetPath)) return tag;
    try {
      const css = await fetchCodeWorkspaceTextFile(
        artifact.projectId,
        stylesheetPath,
      );
      const media = htmlAttributeValue(tag, "media");
      return `<style${media ? ` media="${escapeHtmlAttribute(media)}"` : ""}>\n${escapeClosingTags(css)}\n</style>`;
    } catch {
      return tag;
    }
  });
}

async function inlineLocalPreviewScripts(
  html: string,
  artifact: CodeWorkspaceArtifact,
  path: string,
) {
  return replacePreviewMatches(
    html,
    /<script\b[^>]*\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>\s*<\/script>/gi,
    async (match) => {
      const tag = match[0];
      const openingTag = tag.match(/^<script\b([^>]*)>/i)?.[1] ?? "";
      const src = htmlAttributeValue(tag, "src");
      const scriptPath = src ? normalizeWorkspaceHref(path, src) : null;
      if (!scriptPath) return tag;
      if (!hasWorkspaceTextFile(artifact.files, scriptPath)) return tag;
      try {
        const js = await fetchCodeWorkspaceTextFile(
          artifact.projectId,
          scriptPath,
        );
        const attrs = openingTag
          .replace(/\s+src\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
          .replace(
            /\s+(?:integrity|crossorigin|referrerpolicy)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
            "",
          );
        return `<script${attrs}>\n${escapeClosingTags(js)}\n</script>`;
      } catch {
        return tag;
      }
    },
  );
}

async function inlineLocalPreviewAssets(
  html: string,
  artifact: CodeWorkspaceArtifact,
  path: string,
) {
  return inlineLocalPreviewScripts(
    await inlineLocalPreviewStyles(html, artifact, path),
    artifact,
    path,
  );
}

export function CodeWorkspacePreviewFrame({
  artifact,
}: {
  artifact: CodeWorkspaceArtifact;
}) {
  const t = useTranslations("chat.artifacts");
  const [previewPath, setPreviewPath] = useState(artifact.rootFile);
  const [effectivePath, setEffectivePath] = useState(artifact.rootFile);
  const [srcDoc, setSrcDoc] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handlePreviewNavigation(event: MessageEvent) {
      const data = event.data as {
        type?: unknown;
        projectId?: unknown;
        path?: unknown;
      };
      if (
        data?.type !== "code-workspace-preview:navigate" ||
        data.projectId !== artifact.projectId ||
        typeof data.path !== "string"
      ) {
        return;
      }
      if (
        !artifact.files.some((file) => file.path === data.path && !file.binary)
      ) {
        setError(`Preview file not found: ${data.path}`);
        return;
      }
      setPreviewPath(data.path);
    }
    window.addEventListener("message", handlePreviewNavigation);
    return () => window.removeEventListener("message", handlePreviewNavigation);
  }, [artifact.files, artifact.projectId]);

  useEffect(() => {
    if (!previewPath) return;
    let cancelled = false;
    async function loadPreview() {
      setError(null);
      try {
        let path = previewPath ?? "";
        let html = await fetchCodeWorkspaceTextFile(artifact.projectId, path);
        const redirectPath = metaRefreshTarget(html, path);
        if (
          redirectPath &&
          artifact.files.some(
            (file) => file.path === redirectPath && !file.binary,
          )
        ) {
          path = redirectPath;
          html = await fetchCodeWorkspaceTextFile(artifact.projectId, path);
        }
        const inlinedHtml = await inlineLocalPreviewAssets(
          html,
          artifact,
          path,
        );
        if (!cancelled) {
          setEffectivePath(path);
          setSrcDoc(buildPreviewSrcDoc(inlinedHtml, artifact, path));
        }
      } catch (loadError) {
        if (!cancelled) {
          setSrcDoc("");
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load preview",
          );
        }
      }
    }
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [artifact, previewPath]);

  if (!artifact.rootFile) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
        {t("noHtmlPreview")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-destructive">
        {error}
      </div>
    );
  }

  return srcDoc ? (
    <iframe
      key={`${artifact.projectId}:${artifact.version}:${effectivePath}`}
      title={t("previewTitle", { name: artifact.title })}
      srcDoc={srcDoc}
      allow="autoplay; fullscreen"
      sandbox="allow-scripts allow-modals"
      className="min-h-[480px] flex-1 bg-white"
    />
  ) : (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
      {t("loadingPreview")}
    </div>
  );
}
