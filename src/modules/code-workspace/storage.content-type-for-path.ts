import { createHash } from "node:crypto";
import path from "node:path";

import { storage } from "@/server/infrastructure/storage";
import { assertSafeProjectId,migrateLegacyProjectToObjectStorage } from "./storage.assert-safe-project-id";
import { CodeWorkspaceArtifact,CodeWorkspaceFileSummary,CodeWorkspaceMetadata,metadataObjectKey } from "./storage.code-workspace-file-summary";

const CONTENT_TYPES_BY_EXTENSION = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".htm", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".cjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".m3u", "audio/x-mpegurl; charset=utf-8"],
  [".m3u8", "application/vnd.apple.mpegurl; charset=utf-8"],
  [".mpd", "application/dash+xml; charset=utf-8"],
  [".vtt", "text/vtt; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".ico", "image/x-icon"],
  [".bmp", "image/bmp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".aac", "audio/aac"],
  [".aif", "audio/aiff"],
  [".aiff", "audio/aiff"],
  [".amr", "audio/amr"],
  [".caf", "audio/x-caf"],
  [".flac", "audio/flac"],
  [".m4a", "audio/mp4"],
  [".mid", "audio/midi"],
  [".midi", "audio/midi"],
  [".mka", "audio/x-matroska"],
  [".mp2", "audio/mpeg"],
  [".mp3", "audio/mpeg"],
  [".mpga", "audio/mpeg"],
  [".oga", "audio/ogg"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".wav", "audio/wav"],
  [".weba", "audio/webm"],
  [".wma", "audio/x-ms-wma"],
  [".3g2", "video/3gpp2"],
  [".3gp", "video/3gpp"],
  [".avi", "video/x-msvideo"],
  [".m2ts", "video/mp2t"],
  [".m4s", "video/iso.segment"],
  [".m4v", "video/mp4"],
  [".mkv", "video/x-matroska"],
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"],
  [".mpeg", "video/mpeg"],
  [".mpg", "video/mpeg"],
  [".mts", "video/mp2t"],
  [".ogv", "video/ogg"],
  [".ts", "video/mp2t"],
  [".vob", "video/mpeg"],
  [".webm", "video/webm"],
  [".wmv", "video/x-ms-wmv"],
]);

export function contentTypeForPath(projectPath: string) {
  return CONTENT_TYPES_BY_EXTENSION.get(path.posix.extname(projectPath).toLowerCase()) ?? "application/octet-stream";
}

export function hashBytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function titleFromFileName(fileName: string) {
  const base = path.basename(fileName).replace(/\.zip$/i, "");
  return base.trim().slice(0, 120) || "Code workspace";
}

export function findRootFile(files: CodeWorkspaceFileSummary[]) {
  const htmlFiles = files
    .filter((file) => /\.html?$/i.test(file.path))
    .map((file) => file.path)
    .sort((a, b) => {
      const aIsIndex = path.posix.basename(a).toLowerCase() === "index.html";
      const bIsIndex = path.posix.basename(b).toLowerCase() === "index.html";
      if (aIsIndex !== bIsIndex) return aIsIndex ? -1 : 1;
      return a.split("/").length - b.split("/").length || a.localeCompare(b);
    });
  return htmlFiles[0] ?? null;
}

export async function saveMetadata(metadata: CodeWorkspaceMetadata) {
  await storage.upload(metadataObjectKey(metadata.id), JSON.stringify(metadata, null, 2), "application/json; charset=utf-8");
}

export async function getCodeWorkspace(projectId: string) {
  assertSafeProjectId(projectId);
  try {
    const bytes = await storage.download(metadataObjectKey(projectId));
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as CodeWorkspaceMetadata;
  } catch {
    const migrated = await migrateLegacyProjectToObjectStorage(projectId);
    if (migrated) return migrated;
    throw new Error("Code workspace not found.");
  }
}

export function codeWorkspaceArtifact(metadata: CodeWorkspaceMetadata, message?: string): CodeWorkspaceArtifact {
  const rootFile = metadata.rootFile;
  return {
    kind: "code_workspace_artifact",
    projectId: metadata.id,
    title: metadata.title,
    rootFile,
    version: metadata.version,
    previewUrl: rootFile ? `/api/workspace/code-projects/${metadata.id}/preview/${metadata.previewToken}/${rootFile}` : null,
    downloadUrl: `/api/workspace/code-projects/${metadata.id}/download`,
    files: [...metadata.files].sort((a, b) => a.path.localeCompare(b.path)),
    message,
  };
}
