import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import TurndownService from "turndown";

import { logHandledWarning } from "@/lib/logger";
import { extractDocument } from "@/modules/document-extraction/service";
import type { RagConfig } from "@/modules/knowledge/rag-config-schema";
import { storage } from "@/server/infrastructure/storage";
import { AttachmentDetection } from "./attachments.chat-image-attachment";

export const mimeTypesByExtension = new Map<string, AttachmentDetection>([
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
