export const documentUploadChunkBytes = 2 * 1024 * 1024;

const maxChunkAttempts = 3;

export function documentUploadChunkCount(sizeBytes: number) {
  return Math.max(1, Math.ceil(sizeBytes / documentUploadChunkBytes));
}

async function responseError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? fallback;
}

async function uploadChunk(input: { chunkUrl: string; file: File; uploadId: string; workspaceId: string; chunkIndex: number; totalChunks: number }) {
  const start = input.chunkIndex * documentUploadChunkBytes;
  const chunk = input.file.slice(start, Math.min(start + documentUploadChunkBytes, input.file.size));
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxChunkAttempts; attempt += 1) {
    const form = new FormData();
    form.set("workspaceId", input.workspaceId);
    form.set("uploadId", input.uploadId);
    form.set("chunkIndex", String(input.chunkIndex));
    form.set("totalChunks", String(input.totalChunks));
    form.set(
      "chunk",
      new File([chunk], `${input.file.name}.part-${input.chunkIndex}`, {
        type: "application/octet-stream",
      }),
    );
    try {
      const response = await fetch(input.chunkUrl, {
        method: "POST",
        body: form,
      });
      if (response.ok) return;
      lastError = new Error(await responseError(response, "Document chunk upload failed."));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Document chunk upload failed.");
    }
  }

  throw lastError ?? new Error("Document chunk upload failed.");
}

export async function uploadDocumentInChunks<TResult>(input: { file: File; workspaceId: string; chunkUrl: string; completeUrl: string; completeMetadata?: Record<string, unknown>; onProgress?: (percentage: number) => void }): Promise<TResult> {
  if (input.file.size === 0) throw new Error("Document file is empty.");
  const uploadId = crypto.randomUUID();
  const totalChunks = documentUploadChunkCount(input.file.size);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    await uploadChunk({
      chunkUrl: input.chunkUrl,
      file: input.file,
      uploadId,
      workspaceId: input.workspaceId,
      chunkIndex,
      totalChunks,
    });
    input.onProgress?.(Math.round(((chunkIndex + 1) / totalChunks) * 90));
  }

  const response = await fetch(input.completeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      uploadId,
      totalChunks,
      fileName: input.file.name,
      mimeType: input.file.type,
      ...input.completeMetadata,
    }),
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "Document upload could not be completed."));
  }
  input.onProgress?.(100);
  return (await response.json()) as TResult;
}
