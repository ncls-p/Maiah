import { createHash, randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

import { logHandledError } from "@/lib/logger";
import { isPathTraversal } from "@/lib/path-utils";
import { storage } from "@/server/infrastructure/storage";
import { assertSafeProjectId } from "./storage.assert-safe-project-id";

export type CodeWorkspaceFileSummary = {
  path: string;
  size: number;
  mimeType: string;
  binary: boolean;
  hash: string;
  updatedAt: string;
};

export type CodeWorkspaceMetadata = {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  title: string;
  rootFile: string | null;
  version: number;
  previewToken: string;
  createdAt: string;
  updatedAt: string;
  files: CodeWorkspaceFileSummary[];
};

export type CodeWorkspaceArtifact = {
  kind: "code_workspace_artifact";
  projectId: string;
  title: string;
  rootFile: string | null;
  version: number;
  previewUrl: string | null;
  downloadUrl: string;
  files: CodeWorkspaceFileSummary[];
  message?: string;
};

export type CodeWorkspaceReadResult = {
  projectId: string;
  path: string;
  content: string;
  mimeType: string;
  size: number;
  hash: string;
  version: number;
};

export type CodeWorkspaceCreateFileInput = {
  path: string;
  content?: string;
};

const codeWorkspaceStoragePrefix =
  process.env.CODE_WORKSPACE_STORAGE_PREFIX ?? "code-workspaces";
export const legacyCodeWorkspaceRoots = Array.from(
  new Set(
    [
      process.env.CODE_WORKSPACE_DIR,
      path.join(os.tmpdir(), "ai-hub", "code-workspaces"),
      path.join(process.cwd(), ".data", "code-workspaces"),
    ].filter((value): value is string => Boolean(value)),
  ),
);
export const maxZipBytes = 20 * 1024 * 1024;
export const maxExtractedBytes = 50 * 1024 * 1024;
export const maxFiles = 500;
export const maxPathSegments = 16;
export const maxPathLength = 260;
export const maxTextFileBytes = 1_000_000;

export const textExtensions = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".txt",
  ".md",
  ".svg",
  ".xml",
  ".webmanifest",
  ".m3u",
  ".m3u8",
  ".mpd",
  ".vtt",
]);

export const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".bmp",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".aac",
  ".aif",
  ".aiff",
  ".amr",
  ".caf",
  ".flac",
  ".m4a",
  ".mid",
  ".midi",
  ".mka",
  ".mp2",
  ".mp3",
  ".mpga",
  ".oga",
  ".ogg",
  ".opus",
  ".wav",
  ".weba",
  ".wma",
  ".3g2",
  ".3gp",
  ".avi",
  ".m2ts",
  ".m4s",
  ".m4v",
  ".mkv",
  ".mp4",
  ".mov",
  ".mpeg",
  ".mpg",
  ".mts",
  ".ogv",
  ".ts",
  ".vob",
  ".webm",
  ".wmv",
]);

export const ignoredPathPrefixes = ["__MACOSX/", ".git/", "node_modules/"];
export const ignoredFileNames = new Set([".DS_Store", "Thumbs.db"]);

function workspaceObjectKey(projectId: string, ...segments: string[]) {
  assertSafeProjectId(projectId);
  return [codeWorkspaceStoragePrefix, projectId, ...segments]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export function metadataObjectKey(projectId: string) {
  return workspaceObjectKey(projectId, "metadata.json");
}

export function fileObjectKey(projectId: string, projectPath: string) {
  return workspaceObjectKey(projectId, "files", projectPath);
}

export function legacyProjectDirectory(projectId: string, root: string) {
  return path.join(root, projectId);
}

export function legacyProjectFilesDirectory(projectId: string, root: string) {
  return path.join(legacyProjectDirectory(projectId, root), "files");
}

export function legacyMetadataPath(projectId: string, root: string) {
  return path.join(legacyProjectDirectory(projectId, root), "metadata.json");
}
