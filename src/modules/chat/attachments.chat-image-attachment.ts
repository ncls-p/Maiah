import "pdf-parse/worker";
import TurndownService from "turndown";


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

export type ChatImageAttachmentMetadata = ChatImageAttachment &
  ChatAttachmentMetadataFields;
export type ChatFileAttachmentMetadata = ChatFileAttachment &
  ChatAttachmentMetadataFields;
export type ChatAttachmentMetadata =
  | ChatImageAttachmentMetadata
  | ChatFileAttachmentMetadata;

export type AttachmentDetection = {
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

export type ExtractedText = {
  text: string;
  status: ChatFileAttachment["extractionStatus"];
  message?: string;
};

export const chatAttachmentStoragePrefix =
  process.env.CHAT_ATTACHMENT_STORAGE_PREFIX ?? "chat-attachments";
export const maxStoredChatAttachmentMarkdownChars = 4_000_000;
export const maxChatAttachmentPreviewChars = 120_000;
export const maxMarkdownConversionSourceChars =
  maxStoredChatAttachmentMarkdownChars;
export const maxMarkdownTableRows = 2_000;
export const maxMarkdownTableColumns = 100;

export const maxOfficeXmlBytes = 8 * 1024 * 1024;
export const maxPdfPages = 500;
export const unsupportedChatImageTypeMessage =
  "Unsupported image type. Upload PNG, JPEG, GIF, or WebP.";
export const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
export const htmlToMarkdown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
});

export const imageTypes = {
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

export const textMimeTypes = new Set([
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

export const textExtensionsByMimeType = new Map([
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
