import path from "node:path";
import "pdf-parse/worker";

import {
AttachmentDetection,
ExtractedText,
maxStoredChatAttachmentMarkdownChars,
textExtensionsByMimeType,
textMimeTypes,
} from "./attachments.chat-image-attachment";
import {
codeTextExtensions,
detectByExtension,
detectOfficeAttachment,
detectPdfAttachment,
hasZipSignature,
normalizedDeclaredMimeType,
} from "./attachments.code-text-extensions";

function detectCodeTextAttachment(
  extension: string,
): AttachmentDetection | null {
  if (!codeTextExtensions.has(extension)) return null;
  return {
    mimeType: "text/plain; charset=utf-8",
    extension: extension || ".txt",
    category: "text",
    textKind: "text",
  };
}

function detectDeclaredTextAttachment(
  declaredMimeType: string | null,
  extension: string,
): AttachmentDetection | null {
  if (!declaredMimeType || !textMimeTypes.has(declaredMimeType)) return null;
  const detectedExtension =
    extension || textExtensionsByMimeType.get(declaredMimeType) || ".txt";
  return {
    mimeType: `${declaredMimeType}; charset=utf-8`,
    extension: detectedExtension,
    category: "text",
    textKind:
      declaredMimeType === "text/rtf"
        ? "rtf"
        : declaredMimeType === "text/markdown"
          ? "markdown"
          : "text",
  };
}

function detectUtf8Attachment(
  bytes: Uint8Array,
  declaredMimeType: string | null,
  extension: string,
): AttachmentDetection | null {
  if (!isUtf8Text(bytes)) return null;
  return {
    mimeType: declaredMimeType?.startsWith("text/")
      ? `${declaredMimeType}; charset=utf-8`
      : "text/plain; charset=utf-8",
    extension: extension || ".txt",
    category: "text",
    textKind: "text",
  };
}

function fallbackFileAttachment(
  declaredMimeType: string | null,
  extension: string,
): AttachmentDetection {
  return {
    mimeType: declaredMimeType || "application/octet-stream",
    extension: extension || ".bin",
    category: "file",
    textKind: "none",
  };
}

function isUtf8Text(bytes: Uint8Array) {
  if (bytes.length === 0) return true;
  const sample = bytes.slice(0, Math.min(bytes.length, 8192));
  let controlCount = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x08 || (byte > 0x0d && byte < 0x20)) controlCount += 1;
  }
  if (controlCount / sample.length > 0.03) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

export function detectAttachment(input: {
  fileName: string;
  declaredMimeType?: string;
  bytes: Uint8Array;
}): AttachmentDetection {
  const extension = path.extname(input.fileName).toLowerCase();
  const declaredMimeType = normalizedDeclaredMimeType(input.declaredMimeType);
  const isZipArchive = hasZipSignature(input.bytes);

  return (
    detectPdfAttachment(input.bytes, declaredMimeType) ??
    detectOfficeAttachment(declaredMimeType, isZipArchive) ??
    detectByExtension(extension, isZipArchive) ??
    detectCodeTextAttachment(extension) ??
    detectDeclaredTextAttachment(declaredMimeType, extension) ??
    detectUtf8Attachment(input.bytes, declaredMimeType, extension) ??
    fallbackFileAttachment(declaredMimeType, extension)
  );
}

export function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function limitExtractedText(
  text: string,
  message?: string,
  forceTruncated = false,
): ExtractedText {
  const normalized = normalizeExtractedText(text);
  if (!normalized) {
    return {
      text: "",
      status: "unreadable",
      message: message ?? "No readable text could be extracted from this file.",
    };
  }
  if (normalized.length <= maxStoredChatAttachmentMarkdownChars) {
    return {
      text: normalized,
      status: forceTruncated ? "truncated" : "readable",
      message,
    };
  }
  return {
    text: `${normalized.slice(0, maxStoredChatAttachmentMarkdownChars)}\n\n[Attachment text truncated for safety.]`,
    status: "truncated",
    message:
      message ??
      `Only the first ${maxStoredChatAttachmentMarkdownChars.toLocaleString()} characters were extracted.`,
  };
}

export function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

export const markdownLanguagesByExtension = new Map([
  [".c", "c"],
  [".cpp", "cpp"],
  [".cs", "csharp"],
  [".css", "css"],
  [".go", "go"],
  [".java", "java"],
  [".js", "javascript"],
  [".json", "json"],
  [".jsonl", "json"],
  [".jsx", "jsx"],
  [".kt", "kotlin"],
  [".log", "text"],
  [".mjs", "javascript"],
  [".php", "php"],
  [".py", "python"],
  [".rb", "ruby"],
  [".rs", "rust"],
  [".sh", "bash"],
  [".sql", "sql"],
  [".svg", "xml"],
  [".svelte", "svelte"],
  [".swift", "swift"],
  [".toml", "toml"],
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".vue", "vue"],
  [".xml", "xml"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
]);
