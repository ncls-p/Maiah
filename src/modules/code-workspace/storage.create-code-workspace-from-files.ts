import { randomUUID } from "node:crypto";

import { storage } from "@/server/infrastructure/storage";
import { deleteUploadedProject,isAllowedPath,isTextWorkspacePath,normalizeWorkspacePath } from "./storage.assert-safe-project-id";
import { CodeWorkspaceCreateFileInput,CodeWorkspaceFileSummary,CodeWorkspaceMetadata,fileObjectKey,maxExtractedBytes,maxFiles,maxTextFileBytes } from "./storage.code-workspace-file-summary";
import { codeWorkspaceArtifact,contentTypeForPath,findRootFile,hashBytes,saveMetadata } from "./storage.content-type-for-path";

export async function createCodeWorkspaceFromFiles(input: { workspaceId: string; userId: string; title: string; rootFile?: string | null; files: CodeWorkspaceCreateFileInput[] }) {
  if (input.files.length === 0) {
    throw new Error("Create at least one file in the code workspace.");
  }
  if (input.files.length > maxFiles) {
    throw new Error(`Too many files. Maximum is ${maxFiles}.`);
  }

  const projectId = randomUUID();
  const now = new Date().toISOString();
  const summaries: CodeWorkspaceFileSummary[] = [];
  const seenPaths = new Set<string>();
  const writtenPaths: string[] = [];
  let totalBytes = 0;

  try {
    for (const file of input.files) {
      const projectPath = normalizeWorkspacePath(file.path);
      if (seenPaths.has(projectPath)) {
        throw new Error(`Duplicate file path: ${projectPath}`);
      }
      seenPaths.add(projectPath);
      if (!isAllowedPath(projectPath) || !isTextWorkspacePath(projectPath)) {
        throw new Error(`Unsupported text file type: ${projectPath}`);
      }
      const bytes = new TextEncoder().encode(file.content ?? "");
      if (bytes.byteLength > maxTextFileBytes) {
        throw new Error(`Text file is too large: ${projectPath}`);
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > maxExtractedBytes) {
        throw new Error("Code workspace contents are too large. Maximum is 50 MB.");
      }

      await storage.upload(fileObjectKey(projectId, projectPath), bytes, contentTypeForPath(projectPath));
      writtenPaths.push(projectPath);
      summaries.push({
        path: projectPath,
        size: bytes.byteLength,
        mimeType: contentTypeForPath(projectPath),
        binary: false,
        hash: hashBytes(bytes),
        updatedAt: now,
      });
    }

    const requestedRootFile = input.rootFile ? normalizeWorkspacePath(input.rootFile) : null;
    if (requestedRootFile && !summaries.some((file) => file.path === requestedRootFile)) {
      throw new Error("rootFile must reference one of the created files.");
    }
    const rootFile = requestedRootFile ?? findRootFile(summaries);
    if (!rootFile) {
      throw new Error("Create at least one HTML file, usually index.html.");
    }
    if (!/\.html?$/i.test(rootFile)) {
      throw new Error("rootFile must be an HTML file.");
    }

    const metadata: CodeWorkspaceMetadata = {
      id: projectId,
      workspaceId: input.workspaceId,
      createdByUserId: input.userId,
      title: input.title.trim().slice(0, 120) || "Code workspace",
      rootFile,
      version: 1,
      previewToken: randomUUID(),
      createdAt: now,
      updatedAt: now,
      files: summaries.sort((a, b) => a.path.localeCompare(b.path)),
    };
    await saveMetadata(metadata);
    return codeWorkspaceArtifact(metadata, "Created code workspace.");
  } catch (error) {
    await deleteUploadedProject(projectId, writtenPaths);
    throw error;
  }
}
