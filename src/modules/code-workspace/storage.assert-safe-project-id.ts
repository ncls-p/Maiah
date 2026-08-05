import JSZip from "jszip";
import { readFile,rm,stat } from "node:fs/promises";
import path from "node:path";

import { isPathTraversal } from "@/lib/path-utils";
import { storage } from "@/server/infrastructure/storage";
import {
CodeWorkspaceFileSummary,
CodeWorkspaceMetadata,
binaryExtensions,
fileObjectKey,
ignoredFileNames,
ignoredPathPrefixes,
legacyCodeWorkspaceRoots,
legacyMetadataPath,
legacyProjectDirectory,
legacyProjectFilesDirectory,
maxPathLength,
maxPathSegments,
metadataObjectKey,
textExtensions,
} from "./storage.code-workspace-file-summary";

export function assertSafeProjectId(projectId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      projectId,
    )
  ) {
    throw new Error("Invalid code workspace id.");
  }
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function safeLegacyStoragePath(
  root: string,
  projectId: string,
  projectPath: string,
) {
  assertSafeProjectId(projectId);
  const filesRoot = legacyProjectFilesDirectory(projectId, root);
  const fullPath = path.resolve(filesRoot, projectPath);
  const resolvedRoot = path.resolve(filesRoot);
  if (
    fullPath !== resolvedRoot &&
    !fullPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Path traversal is not allowed.");
  }
  return fullPath;
}

export async function migrateLegacyProjectToObjectStorage(projectId: string) {
  for (const root of legacyCodeWorkspaceRoots) {
    const metadataFilePath = legacyMetadataPath(projectId, root);
    if (!(await pathExists(metadataFilePath))) continue;

    const raw = await readFile(metadataFilePath, "utf8");
    let metadata: CodeWorkspaceMetadata;
    try {
      metadata = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const file of metadata.files) {
      const bytes = await readFile(
        safeLegacyStoragePath(root, projectId, file.path),
      );
      await storage.upload(
        fileObjectKey(projectId, file.path),
        bytes,
        file.mimeType,
      );
    }
    await storage.upload(
      metadataObjectKey(projectId),
      JSON.stringify(metadata, null, 2),
      "application/json; charset=utf-8",
    );
    try {
      await rm(legacyProjectDirectory(projectId, root), {
        recursive: true,
        force: true,
      });
    } catch {
      // Best-effort cleanup after the object-storage migration succeeds.
    }
    return metadata;
  }
  return null;
}

export async function deleteUploadedProject(
  projectId: string,
  filePaths: string[],
) {
  await Promise.all(
    Array.from(new Set(filePaths))
      .map((filePath) => fileObjectKey(projectId, filePath))
      .concat(metadataObjectKey(projectId))
      .map((key) => storage.delete(key).catch(() => undefined)),
  );
}

export function normalizeWorkspacePath(rawPath: string) {
  const trimmed = rawPath.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.includes("\0")) {
    throw new Error("Invalid file path.");
  }
  if (trimmed.startsWith("/") || /^[a-zA-Z]:\//.test(trimmed)) {
    throw new Error("Absolute paths are not allowed.");
  }
  const normalized = path.posix.normalize(trimmed).replace(/^\.\//, "");
  if (isPathTraversal(normalized)) {
    throw new Error("Path traversal is not allowed.");
  }
  if (normalized.length > maxPathLength) {
    throw new Error("File path is too long.");
  }
  if (normalized.split("/").length > maxPathSegments) {
    throw new Error("File path is too deep.");
  }
  return normalized;
}

export function isIgnoredPath(projectPath: string) {
  const lowerPath = projectPath.toLowerCase();
  if (
    ignoredPathPrefixes.some((prefix) =>
      lowerPath.startsWith(prefix.toLowerCase()),
    )
  ) {
    return true;
  }
  return ignoredFileNames.has(path.posix.basename(projectPath));
}

export function isAllowedPath(projectPath: string) {
  const extension = path.posix.extname(projectPath).toLowerCase();
  return textExtensions.has(extension) || binaryExtensions.has(extension);
}

export function declaredZipUncompressedSize(entry: JSZip.JSZipObject) {
  const compressedEntry = entry as unknown as {
    _data?: { uncompressedSize?: unknown };
  };
  const size = compressedEntry._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

export function totalWorkspaceBytes(files: CodeWorkspaceFileSummary[]) {
  return files.reduce((total, file) => total + file.size, 0);
}

export function isTextWorkspacePath(projectPath: string) {
  return textExtensions.has(path.posix.extname(projectPath).toLowerCase());
}
