import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { documentUploadChunkBytes } from "@/modules/document-upload/chunked-upload";
import { storage } from "@/server/infrastructure/storage";

const uploadIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function chunkObjectKey(input: {
  workspaceId: string;
  userId: string;
  uploadId: string;
  chunkIndex: number;
}) {
  return `document-uploads/${safeSegment(input.workspaceId)}/${safeSegment(input.userId)}/${input.uploadId}/parts/${String(input.chunkIndex).padStart(10, "0")}.part`;
}

export function parseChunkMetadata(form: FormData) {
  const workspaceId = form.get("workspaceId");
  const uploadId = form.get("uploadId");
  const chunkIndex = Number(form.get("chunkIndex"));
  const totalChunks = Number(form.get("totalChunks"));
  const chunk = form.get("chunk");
  if (
    typeof workspaceId !== "string" ||
    typeof uploadId !== "string" ||
    !uploadIdPattern.test(uploadId) ||
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex < 0 ||
    !Number.isSafeInteger(totalChunks) ||
    totalChunks <= 0 ||
    chunkIndex >= totalChunks ||
    !(chunk instanceof File) ||
    chunk.size <= 0 ||
    chunk.size > documentUploadChunkBytes
  ) {
    return null;
  }
  return { workspaceId, uploadId, chunkIndex, totalChunks, chunk };
}

export async function storeDocumentUploadChunk(input: {
  workspaceId: string;
  userId: string;
  uploadId: string;
  chunkIndex: number;
  bytes: Uint8Array;
}) {
  await storage.upload(
    chunkObjectKey(input),
    input.bytes,
    "application/octet-stream",
  );
}

export function parseCompletionMetadata(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.workspaceId !== "string" ||
    typeof record.uploadId !== "string" ||
    !uploadIdPattern.test(record.uploadId) ||
    !Number.isSafeInteger(record.totalChunks) ||
    (record.totalChunks as number) <= 0 ||
    typeof record.fileName !== "string" ||
    !record.fileName.trim() ||
    (record.mimeType !== undefined && typeof record.mimeType !== "string")
  ) {
    return null;
  }
  return {
    workspaceId: record.workspaceId,
    uploadId: record.uploadId,
    totalChunks: record.totalChunks as number,
    fileName: record.fileName,
    mimeType: (record.mimeType as string | undefined) ?? "",
  };
}

export async function assembleDocumentUpload(input: {
  workspaceId: string;
  userId: string;
  uploadId: string;
  totalChunks: number;
}) {
  const directory = await mkdtemp(path.join(tmpdir(), "maiah-document-"));
  const filePath = path.join(directory, "upload.bin");
  try {
    for (let chunkIndex = 0; chunkIndex < input.totalChunks; chunkIndex += 1) {
      const bytes = await storage.download(
        chunkObjectKey({ ...input, chunkIndex }),
      );
      if (chunkIndex === 0) await writeFile(filePath, bytes);
      else await appendFile(filePath, bytes);
    }
    return {
      filePath,
      readBytes: async () => new Uint8Array(await readFile(filePath)),
      cleanup: async (deleteParts: boolean) => {
        if (deleteParts) {
          await Promise.allSettled(
            Array.from({ length: input.totalChunks }, (_, chunkIndex) =>
              storage.delete(chunkObjectKey({ ...input, chunkIndex })),
            ),
          );
        }
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
