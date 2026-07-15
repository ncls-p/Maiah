import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import TurndownService from "turndown";

import { logHandledWarning } from "@/lib/logger";
import { storage } from "@/server/infrastructure/storage";

export type ChatImageAttachment = {
  kind: "chat_image";
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  url: string;
};

export type ChatFileAttachment = {
  kind: "chat_file";
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  url: string;
  category: "document" | "presentation" | "spreadsheet" | "text" | "file";
  extractionStatus: "readable" | "truncated" | "unreadable";
  extractedTextChars: number;
  extractionMessage?: string;
};

export type ChatAttachment = ChatImageAttachment | ChatFileAttachment;

type ChatAttachmentMetadataFields = {
  workspaceId: string;
  createdByUserId: string;
  objectKey: string;
  extractedTextObjectKey?: string;
  createdAt: string;
};

type ChatImageAttachmentMetadata = ChatImageAttachment &
  ChatAttachmentMetadataFields;
export type ChatFileAttachmentMetadata = ChatFileAttachment &
  ChatAttachmentMetadataFields;
export type ChatAttachmentMetadata =
  | ChatImageAttachmentMetadata
  | ChatFileAttachmentMetadata;

type AttachmentDetection = {
  mimeType: string;
  extension: string;
  category: ChatFileAttachment["category"];
  textKind:
    | "text"
    | "markdown"
    | "pdf"
    | "docx"
    | "pptx"
    | "xlsx"
    | "rtf"
    | "none";
};

type ExtractedText = {
  text: string;
  status: ChatFileAttachment["extractionStatus"];
  message?: string;
};

const chatAttachmentStoragePrefix =
  process.env.CHAT_ATTACHMENT_STORAGE_PREFIX ?? "chat-attachments";
const maxChatImageBytes = 8 * 1024 * 1024;
export const maxChatAttachmentBytes = 25 * 1024 * 1024;
export const maxChatAttachments = 8;
const maxStoredChatAttachmentMarkdownChars = 4_000_000;
export const maxChatAttachmentPreviewChars = 120_000;
const maxMarkdownConversionSourceChars = maxStoredChatAttachmentMarkdownChars;
const maxMarkdownTableRows = 2_000;
const maxMarkdownTableColumns = 100;

const maxOfficeXmlBytes = 8 * 1024 * 1024;
const maxPdfPages = 500;
const unsupportedChatImageTypeMessage =
  "Unsupported image type. Upload PNG, JPEG, GIF, or WebP.";
const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
const htmlToMarkdown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
});

const imageTypes = {
  "image/jpeg": {
    extension: ".jpg",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
  },
  "image/png": {
    extension: ".png",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  "image/webp": {
    extension: ".webp",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
  },
  "image/gif": {
    extension: ".gif",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 6 &&
      (String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a" ||
        String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a"),
  },
} satisfies Record<
  string,
  { extension: string; matches: (bytes: Uint8Array) => boolean }
>;

const textMimeTypes = new Set([
  "application/json",
  "application/ld+json",
  "application/x-ndjson",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "text/css",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/markdown",
  "text/plain",
  "text/rtf",
  "text/tab-separated-values",
  "text/xml",
]);

const textExtensionsByMimeType = new Map([
  ["application/json", ".json"],
  ["application/ld+json", ".json"],
  ["application/x-ndjson", ".jsonl"],
  ["application/xml", ".xml"],
  ["application/yaml", ".yaml"],
  ["application/x-yaml", ".yaml"],
  ["text/css", ".css"],
  ["text/csv", ".csv"],
  ["text/html", ".html"],
  ["text/javascript", ".js"],
  ["text/markdown", ".md"],
  ["text/plain", ".txt"],
  ["text/rtf", ".rtf"],
  ["text/tab-separated-values", ".tsv"],
  ["text/xml", ".xml"],
]);

const mimeTypesByExtension = new Map<string, AttachmentDetection>([
  [
    ".csv",
    {
      mimeType: "text/csv; charset=utf-8",
      extension: ".csv",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".docx",
    {
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: ".docx",
      category: "document",
      textKind: "docx",
    },
  ],
  [
    ".htm",
    {
      mimeType: "text/html; charset=utf-8",
      extension: ".html",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".html",
    {
      mimeType: "text/html; charset=utf-8",
      extension: ".html",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".json",
    {
      mimeType: "application/json; charset=utf-8",
      extension: ".json",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".jsonl",
    {
      mimeType: "application/x-ndjson; charset=utf-8",
      extension: ".jsonl",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".md",
    {
      mimeType: "text/markdown; charset=utf-8",
      extension: ".md",
      category: "text",
      textKind: "markdown",
    },
  ],
  [
    ".markdown",
    {
      mimeType: "text/markdown; charset=utf-8",
      extension: ".md",
      category: "text",
      textKind: "markdown",
    },
  ],
  [
    ".pdf",
    {
      mimeType: "application/pdf",
      extension: ".pdf",
      category: "document",
      textKind: "pdf",
    },
  ],
  [
    ".pptx",
    {
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: ".pptx",
      category: "presentation",
      textKind: "pptx",
    },
  ],
  [
    ".log",
    {
      mimeType: "text/plain; charset=utf-8",
      extension: ".log",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".rtf",
    {
      mimeType: "application/rtf",
      extension: ".rtf",
      category: "document",
      textKind: "rtf",
    },
  ],
  [
    ".svg",
    {
      mimeType: "image/svg+xml; charset=utf-8",
      extension: ".svg",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".text",
    {
      mimeType: "text/plain; charset=utf-8",
      extension: ".txt",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".tsv",
    {
      mimeType: "text/tab-separated-values; charset=utf-8",
      extension: ".tsv",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".txt",
    {
      mimeType: "text/plain; charset=utf-8",
      extension: ".txt",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".xlsm",
    {
      mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
      extension: ".xlsm",
      category: "spreadsheet",
      textKind: "xlsx",
    },
  ],
  [
    ".xlsx",
    {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: ".xlsx",
      category: "spreadsheet",
      textKind: "xlsx",
    },
  ],
  [
    ".toml",
    {
      mimeType: "application/toml; charset=utf-8",
      extension: ".toml",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".xml",
    {
      mimeType: "text/xml; charset=utf-8",
      extension: ".xml",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".yaml",
    {
      mimeType: "application/yaml; charset=utf-8",
      extension: ".yaml",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".yml",
    {
      mimeType: "application/yaml; charset=utf-8",
      extension: ".yaml",
      category: "text",
      textKind: "text",
    },
  ],
]);

const codeTextExtensions = new Set([
  ".c",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".tsx",
  ".ts",
  ".vue",
]);

function chatAttachmentObjectKey(attachmentId: string, segment: string) {
  assertSafeAttachmentId(attachmentId);
  return [chatAttachmentStoragePrefix, attachmentId, segment]
    .map((value) => value.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function metadataObjectKey(attachmentId: string) {
  return chatAttachmentObjectKey(attachmentId, "metadata.json");
}

function extractedTextObjectKey(attachmentId: string) {
  return chatAttachmentObjectKey(attachmentId, "extracted.md");
}

function assertSafeAttachmentId(attachmentId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      attachmentId,
    )
  ) {
    throw new Error("Invalid attachment id.");
  }
}

function hashBytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeExtension(extension: string, fallbackExtension: string) {
  const normalized = extension.toLowerCase();
  if (/^\.[a-z0-9][a-z0-9._-]{0,15}$/.test(normalized)) return normalized;
  return fallbackExtension;
}

function sanitizeFileName(
  fileName: string,
  fallbackBase: string,
  fallbackExtension: string,
) {
  const parsed = path.parse(fileName.trim());
  const extension = safeExtension(parsed.ext, fallbackExtension);
  const base = (parsed.name || fallbackBase)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return `${base || fallbackBase}${extension}`;
}

function detectImageMimeType(bytes: Uint8Array) {
  for (const [mimeType, type] of Object.entries(imageTypes)) {
    if (type.matches(bytes)) return mimeType as keyof typeof imageTypes;
  }
  return null;
}

function hasPdfSignature(bytes: Uint8Array) {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function hasZipSignature(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

function normalizedDeclaredMimeType(mimeType?: string) {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  return normalized || null;
}

function detectOfficeAttachment(
  declaredMimeType: string | null,
  isZipArchive: boolean,
): AttachmentDetection | null {
  if (!isZipArchive) return null;

  switch (declaredMimeType) {
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return {
        mimeType: declaredMimeType,
        extension: ".docx",
        category: "document",
        textKind: "docx",
      };
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return {
        mimeType: declaredMimeType,
        extension: ".pptx",
        category: "presentation",
        textKind: "pptx",
      };
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return {
        mimeType: declaredMimeType,
        extension: ".xlsx",
        category: "spreadsheet",
        textKind: "xlsx",
      };
    default:
      return null;
  }
}

function isZipBackedOfficeDetection(detection: AttachmentDetection) {
  return ["docx", "pptx", "xlsx"].includes(detection.textKind);
}

function canTrustExtensionDetection(
  detection: AttachmentDetection,
  isZipArchive: boolean,
) {
  return !isZipBackedOfficeDetection(detection) || isZipArchive;
}

function detectPdfAttachment(
  bytes: Uint8Array,
  declaredMimeType: string | null,
): AttachmentDetection | null {
  if (!hasPdfSignature(bytes) && declaredMimeType !== "application/pdf") {
    return null;
  }

  return {
    mimeType: "application/pdf",
    extension: ".pdf",
    category: "document",
    textKind: "pdf",
  };
}

function detectByExtension(
  extension: string,
  isZipArchive: boolean,
): AttachmentDetection | null {
  const detection = mimeTypesByExtension.get(extension);
  if (!detection || !canTrustExtensionDetection(detection, isZipArchive)) {
    return null;
  }
  return detection;
}

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

function detectAttachment(input: {
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

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function limitExtractedText(
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

function decodeXmlEntities(value: string) {
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

const markdownLanguagesByExtension = new Map([
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

function fencedMarkdown(value: string, language = "text") {
  const longestFence = Math.max(
    2,
    ...Array.from(value.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(longestFence + 1);
  return `${fence}${language}\n${value.trim()}\n${fence}`;
}

function escapeMarkdownTableCell(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>")
    .trim();
}

function parseDelimitedRows(value: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      if (quoted && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && value[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function markdownTable(rows: string[][]) {
  if (rows.length === 0) return "";
  const columnCount = rows.reduce(
    (largest, row) => Math.max(largest, row.length),
    0,
  );
  const renderedColumnCount = Math.min(columnCount, maxMarkdownTableColumns);
  const normalizedRows = rows
    .slice(0, maxMarkdownTableRows)
    .map((row) =>
      Array.from({ length: renderedColumnCount }, (_, index) =>
        escapeMarkdownTableCell(row[index] ?? ""),
      ),
    );
  const header = normalizedRows[0];
  const separator = Array.from({ length: renderedColumnCount }, () => "---");
  const body = normalizedRows.slice(1);
  const table = [header, separator, ...body]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
  const truncated =
    rows.length > maxMarkdownTableRows || columnCount > maxMarkdownTableColumns;
  return truncated
    ? `${table}\n\n> Table truncated during Markdown conversion.`
    : table;
}

function textAttachmentToMarkdown(
  value: string,
  detection: AttachmentDetection,
) {
  const normalized = normalizeExtractedText(value);
  if (!normalized) return "";
  if (detection.extension === ".html") {
    return htmlToMarkdown.turndown(normalized);
  }
  if (detection.extension === ".csv" || detection.extension === ".tsv") {
    return markdownTable(
      parseDelimitedRows(
        normalized,
        detection.extension === ".csv" ? "," : "\t",
      ),
    );
  }
  const language = markdownLanguagesByExtension.get(detection.extension);
  return language ? fencedMarkdown(normalized, language) : normalized;
}

function extractXmlText(xml: string) {
  const textNodes = Array.from(
    xml.matchAll(
      /<(?:[a-z0-9_-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?t>/gi,
    ),
    (match) => decodeXmlEntities(match[1].replace(/<[^>]*>/g, "")),
  );
  if (textNodes.length > 0) return textNodes.join(" ");
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, " "));
}

function zipEntryNumber(fileName: string) {
  const match = fileName.match(/(\d+)\.xml$/i);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function declaredZipUncompressedSize(entry: JSZip.JSZipObject) {
  const compressedEntry = entry as unknown as {
    _data?: { uncompressedSize?: unknown };
  };
  const size = compressedEntry._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

function extractDocxMarkdown(xml: string) {
  const paragraphs = Array.from(
    xml.matchAll(
      /<(?:[a-z0-9_-]+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?p>/gi,
    ),
    (match) => match[1],
  );
  if (paragraphs.length === 0) return extractXmlText(xml);

  return paragraphs
    .map((paragraph) => {
      const text = normalizeExtractedText(extractXmlText(paragraph));
      if (!text) return "";
      const style = paragraph.match(
        /<(?:[a-z0-9_-]+:)?pStyle\b[^>]*(?:[a-z0-9_-]+:)?val=["']([^"']+)["']/i,
      )?.[1];
      const headingLevel = style?.match(/^Heading([1-6])$/i)?.[1];
      if (headingLevel) return `${"#".repeat(Number(headingLevel))} ${text}`;
      if (style && /^(?:Title|Subtitle)$/i.test(style)) return `# ${text}`;
      return text;
    })
    .filter(Boolean)
    .join("\n\n");
}

function spreadsheetColumnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return 0;
  return (
    Array.from(letters).reduce(
      (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
      0,
    ) - 1
  );
}

function extractSharedStrings(xml: string) {
  return Array.from(
    xml.matchAll(
      /<(?:[a-z0-9_-]+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?si>/gi,
    ),
    (match) => normalizeExtractedText(extractXmlText(match[1])),
  );
}

function extractWorksheetMarkdown(xml: string, sharedStrings: string[]) {
  const rows = new Map<number, Map<number, string>>();
  for (const match of xml.matchAll(
    /<(?:[a-z0-9_-]+:)?c\b([^>]*)>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?c>/gi,
  )) {
    const attributes = match[1];
    const body = match[2];
    const reference = attributes.match(/\br=["']([^"']+)["']/i)?.[1] ?? "A1";
    const rowIndex = Number.parseInt(reference.match(/\d+$/)?.[0] ?? "1", 10);
    const columnIndex = spreadsheetColumnIndex(reference);
    const type = attributes.match(/\bt=["']([^"']+)["']/i)?.[1];
    const rawValue = body.match(
      /<(?:[a-z0-9_-]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?v>/i,
    )?.[1];
    const value =
      type === "s" && rawValue !== undefined
        ? (sharedStrings[Number.parseInt(rawValue, 10)] ?? rawValue)
        : type === "inlineStr"
          ? extractXmlText(body)
          : decodeXmlEntities(rawValue ?? extractXmlText(body));
    const row = rows.get(rowIndex) ?? new Map<number, string>();
    row.set(columnIndex, normalizeExtractedText(value));
    rows.set(rowIndex, row);
  }

  const tableRows = Array.from(rows.entries())
    .sort(([left], [right]) => left - right)
    .map(([, cells]) => {
      const width = Math.max(0, ...cells.keys()) + 1;
      return Array.from(
        { length: width },
        (_, index) => cells.get(index) ?? "",
      );
    });
  return markdownTable(tableRows);
}

async function extractOfficeText(
  bytes: Uint8Array,
  textKind: Extract<AttachmentDetection["textKind"], "docx" | "pptx" | "xlsx">,
) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => {
      if (textKind === "docx") {
        return (
          /^word\/(?:document|footnotes|endnotes|comments)\.xml$/i.test(
            entry.name,
          ) || /^word\/(?:header|footer)\d+\.xml$/i.test(entry.name)
        );
      }
      if (textKind === "pptx")
        return /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name);
      return /^xl\/(?:sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(
        entry.name,
      );
    })
    .sort((a, b) => zipEntryNumber(a.name) - zipEntryNumber(b.name));

  let totalXmlBytes = 0;
  let truncated = false;
  const loadedEntries: Array<{ name: string; xml: string }> = [];

  for (const entry of entries) {
    const declaredSize = declaredZipUncompressedSize(entry);
    if (declaredSize && totalXmlBytes + declaredSize > maxOfficeXmlBytes) {
      truncated = true;
      break;
    }
    const xmlBytes = await entry.async("uint8array");
    totalXmlBytes += xmlBytes.byteLength;
    if (totalXmlBytes > maxOfficeXmlBytes) {
      truncated = true;
      break;
    }
    loadedEntries.push({ name: entry.name, xml: utf8Decoder.decode(xmlBytes) });
  }

  let markdown = "";
  if (textKind === "docx") {
    markdown = loadedEntries
      .map((entry) => extractDocxMarkdown(entry.xml))
      .filter(Boolean)
      .join("\n\n");
  } else if (textKind === "pptx") {
    markdown = loadedEntries
      .map((entry) => {
        const text = normalizeExtractedText(extractXmlText(entry.xml));
        return text ? `## Slide ${zipEntryNumber(entry.name)}\n\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
  } else {
    const sharedStringsEntry = loadedEntries.find((entry) =>
      /xl\/sharedStrings\.xml$/i.test(entry.name),
    );
    const sharedStrings = sharedStringsEntry
      ? extractSharedStrings(sharedStringsEntry.xml)
      : [];
    markdown = loadedEntries
      .filter((entry) => /xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name))
      .map((entry) => {
        const table = extractWorksheetMarkdown(entry.xml, sharedStrings);
        return table
          ? `## Sheet ${zipEntryNumber(entry.name)}\n\n${table}`
          : "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  return limitExtractedText(
    markdown,
    truncated
      ? "The document was partially read because it is large."
      : undefined,
    truncated,
  );
}

async function extractPdfMarkdown(bytes: Uint8Array) {
  const parser = new PDFParse({ data: Buffer.from(bytes) });
  try {
    const result = await parser.getText({ first: maxPdfPages });
    const markdown = result.pages
      .map((page) => {
        const text = normalizeExtractedText(page.text);
        return text ? `## Page ${page.num}\n\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
    const pagesTruncated = result.total > result.pages.length;
    return limitExtractedText(
      markdown,
      pagesTruncated
        ? `Only the first ${maxPdfPages} PDF pages were extracted.`
        : markdown
          ? undefined
          : "No readable text was found in this PDF; scanned pages may require OCR.",
      pagesTruncated,
    );
  } finally {
    await parser.destroy();
  }
}

function stripRtf(value: string) {
  return value
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, " ")
    .replace(/[{}]/g, " ");
}

async function extractAttachmentText(input: {
  bytes: Uint8Array;
  detection: AttachmentDetection;
}): Promise<ExtractedText> {
  try {
    if (
      input.detection.textKind === "text" ||
      input.detection.textKind === "markdown"
    ) {
      const decoded = utf8Decoder.decode(input.bytes);
      const sourceTruncated = decoded.length > maxMarkdownConversionSourceChars;
      const markdownSource = sourceTruncated
        ? decoded.slice(0, maxMarkdownConversionSourceChars)
        : decoded;
      return limitExtractedText(
        input.detection.textKind === "markdown"
          ? markdownSource
          : textAttachmentToMarkdown(markdownSource, input.detection),
        sourceTruncated
          ? "The file was partially converted to Markdown because it is large."
          : undefined,
        sourceTruncated,
      );
    }
    if (input.detection.textKind === "rtf") {
      const decoded = utf8Decoder.decode(input.bytes);
      const sourceTruncated = decoded.length > maxMarkdownConversionSourceChars;
      return limitExtractedText(
        stripRtf(decoded.slice(0, maxMarkdownConversionSourceChars)),
        sourceTruncated
          ? "The file was partially converted to Markdown because it is large."
          : undefined,
        sourceTruncated,
      );
    }
    if (input.detection.textKind === "pdf") {
      return await extractPdfMarkdown(input.bytes);
    }
    if (
      input.detection.textKind === "docx" ||
      input.detection.textKind === "pptx" ||
      input.detection.textKind === "xlsx"
    ) {
      return await extractOfficeText(input.bytes, input.detection.textKind);
    }
  } catch (error) {
    logHandledWarning("Chat attachment text extraction failed", {
      mimeType: input.detection.mimeType,
      extension: input.detection.extension,
      textKind: input.detection.textKind,
      size: input.bytes.byteLength,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      text: "",
      status: "unreadable",
      message:
        error instanceof Error
          ? `Could not read this file: ${error.message}`
          : "Could not read this file.",
    };
  }

  return {
    text: "",
    status: "unreadable",
    message:
      "This file type was uploaded safely, but no text reader is available for it yet.",
  };
}

export function isChatImageAttachment(
  value: unknown,
): value is ChatImageAttachment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "chat_image" &&
    typeof record.id === "string" &&
    typeof record.fileName === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.size === "number" &&
    typeof record.url === "string"
  );
}

export function isChatFileAttachment(
  value: unknown,
): value is ChatFileAttachment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "chat_file" &&
    typeof record.id === "string" &&
    typeof record.fileName === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.size === "number" &&
    typeof record.url === "string" &&
    typeof record.extractionStatus === "string" &&
    typeof record.extractedTextChars === "number"
  );
}

function assertChatAttachmentAccess(
  metadata: ChatAttachmentMetadata,
  workspaceId: string,
  userId: string,
) {
  if (
    metadata.workspaceId !== workspaceId ||
    metadata.createdByUserId !== userId
  ) {
    throw new Error("Attachment not found.");
  }
}

type CreateChatAttachmentInput = {
  workspaceId: string;
  userId: string;
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array;
};

type CreateChatImageAttachmentInput = Omit<
  CreateChatAttachmentInput,
  "mimeType"
>;

function assertAttachmentHasContent(bytes: Uint8Array) {
  if (bytes.byteLength === 0) {
    throw new Error("Attachment file is empty.");
  }
}

async function deleteStoredAttachmentPart(objectKey: string | undefined) {
  if (!objectKey) return;
  try {
    await storage.delete(objectKey);
  } catch {
    // Cleanup is best-effort after a failed attachment upload.
  }
}

async function createStoredImageAttachment(
  input: CreateChatImageAttachmentInput,
  imageMimeType: keyof typeof imageTypes,
): Promise<ChatImageAttachment> {
  if (input.bytes.byteLength > maxChatImageBytes) {
    throw new Error("Image file is too large. Maximum size is 8 MB.");
  }

  const attachmentId = randomUUID();
  const imageExtension = imageTypes[imageMimeType].extension;
  const objectKey = chatAttachmentObjectKey(
    attachmentId,
    `image${imageExtension}`,
  );
  const metadata: ChatImageAttachmentMetadata = {
    kind: "chat_image",
    id: attachmentId,
    workspaceId: input.workspaceId,
    createdByUserId: input.userId,
    fileName: sanitizeFileName(input.fileName, "image", imageExtension),
    mimeType: imageMimeType,
    size: input.bytes.byteLength,
    hash: hashBytes(input.bytes),
    objectKey,
    url: `/api/workspace/chat-attachments/${attachmentId}`,
    createdAt: new Date().toISOString(),
  };

  try {
    await storage.upload(objectKey, input.bytes, imageMimeType);
    await storage.upload(
      metadataObjectKey(attachmentId),
      JSON.stringify(metadata, null, 2),
      "application/json; charset=utf-8",
    );
    return publicChatImageAttachment(metadata);
  } catch (error) {
    await deleteStoredAttachmentPart(objectKey);
    await deleteStoredAttachmentPart(metadataObjectKey(attachmentId));
    throw error;
  }
}

async function createStoredFileAttachment(
  input: CreateChatAttachmentInput,
): Promise<ChatFileAttachment> {
  if (input.bytes.byteLength > maxChatAttachmentBytes) {
    throw new Error("Attachment file is too large. Maximum size is 25 MB.");
  }

  const detection = detectAttachment({
    fileName: input.fileName,
    declaredMimeType: input.mimeType,
    bytes: input.bytes,
  });
  const extracted = await extractAttachmentText({
    bytes: input.bytes,
    detection,
  });
  const attachmentId = randomUUID();
  const objectKey = chatAttachmentObjectKey(
    attachmentId,
    `file${safeExtension(detection.extension, ".bin")}`,
  );
  const textObjectKey = extracted.text
    ? extractedTextObjectKey(attachmentId)
    : undefined;
  const metadata: ChatFileAttachmentMetadata = {
    kind: "chat_file",
    id: attachmentId,
    workspaceId: input.workspaceId,
    createdByUserId: input.userId,
    fileName: sanitizeFileName(
      input.fileName,
      "attachment",
      detection.extension,
    ),
    mimeType: detection.mimeType,
    size: input.bytes.byteLength,
    hash: hashBytes(input.bytes),
    objectKey,
    ...(textObjectKey ? { extractedTextObjectKey: textObjectKey } : {}),
    url: `/api/workspace/chat-attachments/${attachmentId}`,
    createdAt: new Date().toISOString(),
    category: detection.category,
    extractionStatus: extracted.status,
    extractedTextChars: extracted.text.length,
    ...(extracted.message ? { extractionMessage: extracted.message } : {}),
  };

  try {
    await storage.upload(objectKey, input.bytes, detection.mimeType);
    if (textObjectKey) {
      await storage.upload(
        textObjectKey,
        extracted.text,
        "text/markdown; charset=utf-8",
      );
    }
    await storage.upload(
      metadataObjectKey(attachmentId),
      JSON.stringify(metadata, null, 2),
      "application/json; charset=utf-8",
    );
    return publicChatAttachment(metadata) as ChatFileAttachment;
  } catch (error) {
    await deleteStoredAttachmentPart(objectKey);
    await deleteStoredAttachmentPart(textObjectKey);
    await deleteStoredAttachmentPart(metadataObjectKey(attachmentId));
    throw error;
  }
}

export async function createChatAttachment(
  input: CreateChatAttachmentInput,
): Promise<ChatAttachment> {
  assertAttachmentHasContent(input.bytes);

  const imageMimeType = detectImageMimeType(input.bytes);
  if (imageMimeType) {
    return await createStoredImageAttachment(input, imageMimeType);
  }

  return await createStoredFileAttachment(input);
}

export async function createChatImageAttachment(
  input: CreateChatImageAttachmentInput,
): Promise<ChatImageAttachment> {
  assertAttachmentHasContent(input.bytes);

  const imageMimeType = detectImageMimeType(input.bytes);
  if (!imageMimeType) {
    throw new Error(unsupportedChatImageTypeMessage);
  }

  return await createStoredImageAttachment(input, imageMimeType);
}

export function publicChatAttachment(
  metadata: ChatAttachmentMetadata,
): ChatAttachment {
  if (metadata.kind === "chat_image") {
    return publicChatImageAttachment(metadata);
  }
  return {
    kind: "chat_file",
    id: metadata.id,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    size: metadata.size,
    hash: metadata.hash,
    url: metadata.url,
    category: metadata.category,
    extractionStatus: metadata.extractionStatus,
    extractedTextChars: metadata.extractedTextChars,
    ...(metadata.extractionMessage
      ? { extractionMessage: metadata.extractionMessage }
      : {}),
  };
}

function publicChatImageAttachment(
  metadata: ChatAttachmentMetadata,
): ChatImageAttachment {
  if (metadata.kind !== "chat_image") {
    throw new Error("Attachment is not an image.");
  }
  return {
    kind: "chat_image",
    id: metadata.id,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    size: metadata.size,
    hash: metadata.hash,
    url: metadata.url,
  };
}

export async function getChatAttachment(
  attachmentId: string,
): Promise<ChatAttachmentMetadata> {
  assertSafeAttachmentId(attachmentId);
  const bytes = await storage.download(metadataObjectKey(attachmentId));
  try {
    return JSON.parse(
      Buffer.from(bytes).toString("utf8"),
    ) as ChatAttachmentMetadata;
  } catch {
    throw new Error(`Failed to parse attachment metadata for ${attachmentId}`);
  }
}

export async function getChatAttachmentBytes(input: {
  attachmentId: string;
  workspaceId?: string;
  userId: string;
}) {
  const metadata = await getChatAttachment(input.attachmentId);
  if (input.workspaceId) {
    assertChatAttachmentAccess(metadata, input.workspaceId, input.userId);
  } else if (metadata.createdByUserId !== input.userId) {
    throw new Error("Attachment not found.");
  }
  const bytes = await storage.download(metadata.objectKey);
  return { metadata, bytes };
}

export async function getChatImageAttachmentBytes(input: {
  attachmentId: string;
  workspaceId?: string;
  userId: string;
}) {
  const attachment = await getChatAttachmentBytes(input);
  if (attachment.metadata.kind !== "chat_image") {
    throw new Error("Attachment is not an image.");
  }
  return attachment as {
    metadata: ChatImageAttachmentMetadata;
    bytes: Uint8Array;
  };
}

export async function getChatAttachmentExtractedText(input: {
  attachmentId: string;
  workspaceId: string;
  userId: string;
}): Promise<{ metadata: ChatFileAttachmentMetadata; text: string }> {
  const metadata = await getChatAttachment(input.attachmentId);
  assertChatAttachmentAccess(metadata, input.workspaceId, input.userId);
  if (metadata.kind !== "chat_file") {
    throw new Error("Attachment is not a file.");
  }
  if (!metadata.extractedTextObjectKey) {
    return { metadata, text: "" };
  }
  const bytes = await storage.download(metadata.extractedTextObjectKey);
  return { metadata, text: Buffer.from(bytes).toString("utf8") };
}
