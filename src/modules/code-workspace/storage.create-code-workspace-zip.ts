import JSZip from "jszip";

import { storage } from "@/server/infrastructure/storage";
import { fileObjectKey } from "./storage.code-workspace-file-summary";
import { getCodeWorkspace } from "./storage.content-type-for-path";
import { assertCodeWorkspaceAccess } from "./storage.create-code-workspace-from-zip";

export async function createCodeWorkspaceZip(input: { projectId: string; workspaceId: string; userId?: string }) {
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
