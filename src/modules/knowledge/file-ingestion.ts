import path from "node:path";
import JSZip from "jszip";

import {
  extractUploadedFileText,
  maxChatAttachmentBytes,
} from "@/modules/chat/attachments";
import type { RagConfig } from "@/modules/knowledge/rag-config-schema";

const MAX_FILES_PER_BATCH = 100;
const MAX_EXPANDED_ZIP_BYTES = 50 * 1024 * 1024;

export type KnowledgeUpload = {
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array;
};

function safeUploadName(value: string) {
  return value
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/")
    .slice(0, 512);
}

function isZipUpload(file: KnowledgeUpload) {
  return (
    path.extname(file.fileName).toLowerCase() === ".zip" ||
    file.mimeType?.split(";", 1)[0]?.toLowerCase() === "application/zip"
  );
}

function declaredUncompressedSize(entry: JSZip.JSZipObject) {
  const internal = entry as unknown as {
    _data?: { uncompressedSize?: unknown };
  };
  const size = internal._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

async function expandZip(upload: KnowledgeUpload): Promise<KnowledgeUpload[]> {
  const archive = await JSZip.loadAsync(upload.bytes, { checkCRC32: true });
  const entries = Object.values(archive.files).filter(
    (entry) =>
      !entry.dir &&
      !entry.name.startsWith("__MACOSX/") &&
      !entry.name.endsWith(".DS_Store"),
  );
  if (entries.length > MAX_FILES_PER_BATCH) {
    throw new Error(
      `ZIP archives are limited to ${MAX_FILES_PER_BATCH} files.`,
    );
  }

  let expandedBytes = 0;
  const files: KnowledgeUpload[] = [];
  for (const entry of entries) {
    if (path.extname(entry.name).toLowerCase() === ".zip") {
      throw new Error("Nested ZIP archives are not supported.");
    }
    const declaredSize = declaredUncompressedSize(entry);
    if (
      declaredSize !== null &&
      expandedBytes + declaredSize > MAX_EXPANDED_ZIP_BYTES
    ) {
      throw new Error("Expanded ZIP content exceeds the 50 MB safety limit.");
    }
    const bytes = await entry.async("uint8array");
    expandedBytes += bytes.byteLength;
    if (expandedBytes > MAX_EXPANDED_ZIP_BYTES) {
      throw new Error("Expanded ZIP content exceeds the 50 MB safety limit.");
    }
    files.push({ fileName: safeUploadName(entry.name), bytes });
  }
  return files;
}

export async function extractKnowledgeUploads(
  uploads: KnowledgeUpload[],
  context?: { workspaceId: string; config: RagConfig },
) {
  if (uploads.length === 0) throw new Error("Select at least one file.");
  if (uploads.length > MAX_FILES_PER_BATCH) {
    throw new Error(`Uploads are limited to ${MAX_FILES_PER_BATCH} files.`);
  }
  const totalBytes = uploads.reduce(
    (sum, upload) => sum + upload.bytes.byteLength,
    0,
  );
  if (totalBytes > maxChatAttachmentBytes) {
    throw new Error("The upload batch is limited to 25 MB.");
  }

  const expanded: KnowledgeUpload[] = [];
  for (const upload of uploads) {
    expanded.push(
      ...(isZipUpload(upload) ? await expandZip(upload) : [upload]),
    );
    if (expanded.length > MAX_FILES_PER_BATCH) {
      throw new Error(`Uploads are limited to ${MAX_FILES_PER_BATCH} files.`);
    }
  }

  const files: Array<{
    title: string;
    content: string;
    mimeType: string;
  }> = [];
  const rejected: Array<{ title: string; error: string }> = [];
  for (const upload of expanded) {
    const title = safeUploadName(upload.fileName) || "document";
    try {
      const extracted = await extractUploadedFileText({
        workspaceId: context?.workspaceId,
        fileName: title,
        mimeType: upload.mimeType,
        bytes: upload.bytes,
        ...(context ? { config: context.config } : {}),
      });
      if (!extracted.text || extracted.status === "unreadable") {
        rejected.push({
          title,
          error: extracted.message ?? "No readable text was found.",
        });
      } else {
        files.push({
          title,
          content: extracted.text,
          mimeType: extracted.mimeType,
        });
      }
    } catch (error) {
      rejected.push({
        title,
        error:
          error instanceof Error ? error.message : "File extraction failed.",
      });
    }
  }
  return { files, rejected };
}
