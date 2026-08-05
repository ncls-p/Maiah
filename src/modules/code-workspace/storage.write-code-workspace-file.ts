
import { logHandledError } from "@/lib/logger";
import { storage } from "@/server/infrastructure/storage";
import {
isAllowedPath,
isTextWorkspacePath,
normalizeWorkspacePath,
totalWorkspaceBytes,
} from "./storage.assert-safe-project-id";
import {
CodeWorkspaceFileSummary,
CodeWorkspaceMetadata,
fileObjectKey,
maxExtractedBytes,
maxFiles,
maxTextFileBytes,
} from "./storage.code-workspace-file-summary";
import {
codeWorkspaceArtifact,
contentTypeForPath,
findRootFile,
getCodeWorkspace,
hashBytes,
saveMetadata,
} from "./storage.content-type-for-path";
import {
assertCodeWorkspaceAccess,
encodeWorkspaceTextContent,
fileSummaryForTextContent,
writableWorkspaceFilePath,
} from "./storage.create-code-workspace-from-zip";

function upsertWorkspaceFileSummary(
  files: CodeWorkspaceFileSummary[],
  nextSummary: CodeWorkspaceFileSummary,
) {
  const existingIndex = files.findIndex(
    (file) => file.path === nextSummary.path,
  );
  const nextFiles = [...files];
  if (existingIndex >= 0) {
    nextFiles[existingIndex] = nextSummary;
    return nextFiles;
  }
  if (nextFiles.length >= maxFiles) {
    throw new Error(`Too many files. Maximum is ${maxFiles}.`);
  }
  return [...nextFiles, nextSummary];
}

function updatedCodeWorkspaceMetadata(
  metadata: CodeWorkspaceMetadata,
  nextSummary: CodeWorkspaceFileSummary,
  updatedAt: string,
): CodeWorkspaceMetadata {
  const nextFiles = upsertWorkspaceFileSummary(metadata.files, nextSummary);
  if (totalWorkspaceBytes(nextFiles) > maxExtractedBytes) {
    throw new Error("Code workspace contents are too large. Maximum is 50 MB.");
  }
  const rootFile = nextFiles.some((file) => file.path === metadata.rootFile)
    ? metadata.rootFile
    : findRootFile(nextFiles);
  return {
    ...metadata,
    rootFile,
    version: metadata.version + 1,
    updatedAt,
    files: nextFiles.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export async function writeCodeWorkspaceFile(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
  filePath: string;
  content: string;
}) {
  try {
    const metadata = await getCodeWorkspace(input.projectId);
    assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
    const projectPath = writableWorkspaceFilePath(input.filePath);
    const bytes = encodeWorkspaceTextContent(input.content);
    const updatedAt = new Date().toISOString();
    const nextSummary = fileSummaryForTextContent(
      projectPath,
      bytes,
      updatedAt,
    );
    const nextMetadata = updatedCodeWorkspaceMetadata(
      metadata,
      nextSummary,
      updatedAt,
    );

    await storage.upload(
      fileObjectKey(metadata.id, projectPath),
      bytes,
      nextSummary.mimeType,
    );
    await saveMetadata(nextMetadata);
    return codeWorkspaceArtifact(nextMetadata, `Updated ${projectPath}.`);
  } catch (error) {
    logHandledError("Failed to write code workspace file", {}, error as Error);
    throw error;
  }
}

export async function importCodeWorkspaceFile(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
  filePath: string;
  bytes: Uint8Array;
}) {
  try {
    const metadata = await getCodeWorkspace(input.projectId);
    assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
    const projectPath = normalizeWorkspacePath(input.filePath);
    if (!isAllowedPath(projectPath)) {
      throw new Error("Only supported web files can be imported.");
    }
    if (
      isTextWorkspacePath(projectPath) &&
      input.bytes.byteLength > maxTextFileBytes
    ) {
      throw new Error("File content is too large.");
    }

    const bytes = new Uint8Array(input.bytes);
    const updatedAt = new Date().toISOString();
    const nextSummary: CodeWorkspaceFileSummary = {
      path: projectPath,
      size: bytes.byteLength,
      mimeType: contentTypeForPath(projectPath),
      binary: !isTextWorkspacePath(projectPath),
      hash: hashBytes(bytes),
      updatedAt,
    };
    const nextMetadata = updatedCodeWorkspaceMetadata(
      metadata,
      nextSummary,
      updatedAt,
    );

    await storage.upload(
      fileObjectKey(metadata.id, projectPath),
      bytes,
      nextSummary.mimeType,
    );
    await saveMetadata(nextMetadata);
    return codeWorkspaceArtifact(nextMetadata, `Imported ${projectPath}.`);
  } catch (error) {
    logHandledError("Failed to import code workspace file", {}, error as Error);
    throw error;
  }
}

export async function deleteCodeWorkspaceFile(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
  filePath: string;
}) {
  const metadata = await getCodeWorkspace(input.projectId);
  assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
  const projectPath = normalizeWorkspacePath(input.filePath);
  if (!metadata.files.some((file) => file.path === projectPath)) {
    throw new Error("File not found in code workspace.");
  }
  await storage.delete(fileObjectKey(metadata.id, projectPath));
  const now = new Date().toISOString();
  const nextFiles = metadata.files.filter((file) => file.path !== projectPath);
  const nextMetadata: CodeWorkspaceMetadata = {
    ...metadata,
    rootFile:
      metadata.rootFile === projectPath
        ? findRootFile(nextFiles)
        : metadata.rootFile,
    version: metadata.version + 1,
    updatedAt: now,
    files: nextFiles,
  };
  await saveMetadata(nextMetadata);
  return codeWorkspaceArtifact(nextMetadata, `Deleted ${projectPath}.`);
}

export async function getCodeWorkspaceFileBytes(input: {
  projectId: string;
  filePath: string;
}) {
  const metadata = await getCodeWorkspace(input.projectId);
  const projectPath = normalizeWorkspacePath(
    input.filePath || metadata.rootFile || "index.html",
  );
  const summary = metadata.files.find((file) => file.path === projectPath);
  if (!summary) throw new Error("File not found in code workspace.");
  const bytes = await storage.download(fileObjectKey(metadata.id, projectPath));
  return { metadata, summary, bytes };
}

export async function getCodeWorkspaceFilesForPublish(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
}) {
  const metadata = await getCodeWorkspace(input.projectId);
  assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
  const files = await Promise.all(
    metadata.files.map(async (file) => ({
      ...file,
      bytes: await storage.download(fileObjectKey(metadata.id, file.path)),
    })),
  );
  return { metadata, files };
}
