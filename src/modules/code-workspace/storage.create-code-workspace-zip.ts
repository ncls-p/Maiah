import { createHash, randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

import { logHandledError } from "@/lib/logger";
import { isPathTraversal } from "@/lib/path-utils";
import { storage } from "@/server/infrastructure/storage";
import { getCodeWorkspace } from "./storage.content-type-for-path";
import { assertCodeWorkspaceAccess } from "./storage.create-code-workspace-from-zip";
import { fileObjectKey } from "./storage.code-workspace-file-summary";

export async function createCodeWorkspaceZip(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
}) {
  const metadata = await getCodeWorkspace(input.projectId);
  assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
  const zip = new JSZip();
  for (const file of metadata.files) {
    const bytes = await storage.download(fileObjectKey(metadata.id, file.path));
    zip.file(file.path, bytes);
  }
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    fileName: `${metadata.title.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "code-workspace"}.zip`,
    bytes,
  };
}
