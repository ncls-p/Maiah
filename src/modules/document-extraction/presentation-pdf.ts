import { createHash } from "node:crypto";
import { formatFromBytes } from "@firecrawl/anydoc";
import { env } from "@/lib/env";
import { presentationExtension } from "./presentation-format";

const MAX_BYTES = 64 * 1024 * 1024;
const CACHE_BYTES = 32 * 1024 * 1024;
const cache = new Map<string, Uint8Array>();
const pending = new Map<string, Promise<Uint8Array>>();

async function readPdf(response: Response) {
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("application/pdf")
  ) {
    await response.body?.cancel();
    throw new Error("Presentation conversion failed");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty presentation preview");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES)
        throw new Error("Presentation preview is too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("Invalid presentation preview");
  return bytes;
}

/** Private, bounded conversion. No document URL, credential or user title is sent. */
export async function presentationPdf(input: {
  fileName: string;
  mimeType?: string | null;
  bytes: Uint8Array;
}) {
  const extension = presentationExtension(input.fileName, input.mimeType);
  if (!extension) throw new Error("Not a presentation");
  if (input.bytes.byteLength > MAX_BYTES)
    throw new Error("Presentation exceeds the 64 MiB preview limit");
  const format = formatFromBytes(input.bytes);
  if (!format || !["ppt", "pptx", "odp"].includes(format)) {
    throw new Error("Invalid presentation file");
  }
  if (!env.DOCUMENT_CONVERTER_URL)
    throw new Error("Presentation converter is not configured");
  const key = createHash("sha256")
    .update(extension)
    .update(input.bytes)
    .digest("hex");
  const cached = cache.get(key);
  if (cached) return cached;
  const existing = pending.get(key);
  if (existing) return existing;
  if (pending.size >= 2)
    throw new Error("Presentation converter is busy; please retry");
  const conversion = (async () => {
    const form = new FormData();
    form.set(
      "files",
      new Blob([new Uint8Array(input.bytes)]),
      `presentation.${extension}`,
    );
    form.set("exportNotesPages", "false");
    const response = await fetch(
      new URL("/forms/libreoffice/convert", env.DOCUMENT_CONVERTER_URL),
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(75_000),
        redirect: "error",
      },
    );
    const bytes = await readPdf(response);
    if (bytes.byteLength <= CACHE_BYTES) {
      let size = [...cache.values()].reduce(
        (sum, value) => sum + value.byteLength,
        0,
      );
      for (const [oldKey, value] of cache) {
        if (size + bytes.byteLength <= CACHE_BYTES && cache.size < 8) break;
        cache.delete(oldKey);
        size -= value.byteLength;
      }
      cache.set(key, bytes);
    }
    return bytes;
  })();
  pending.set(key, conversion);
  try {
    return await conversion;
  } finally {
    pending.delete(key);
  }
}
