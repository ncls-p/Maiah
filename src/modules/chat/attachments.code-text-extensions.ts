import { createHash } from "node:crypto";
import path from "node:path";
import "pdf-parse/worker";

import { sourceCodeExtensions } from "@/modules/files/source-code-extensions";
import {
  AttachmentDetection,
  chatAttachmentStoragePrefix,
  imageTypes,
} from "./attachments.chat-image-attachment";
import { mimeTypesByExtension } from "./attachments.mime-types-by-extension";

export const codeTextExtensions = new Set<string>(sourceCodeExtensions);

export function chatAttachmentObjectKey(attachmentId: string, segment: string) {
  assertSafeAttachmentId(attachmentId);
  return [chatAttachmentStoragePrefix, attachmentId, segment]
    .map((value) => value.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export function metadataObjectKey(attachmentId: string) {
  return chatAttachmentObjectKey(attachmentId, "metadata.json");
}

export function extractedTextObjectKey(attachmentId: string) {
  return chatAttachmentObjectKey(attachmentId, "extracted.md");
}

export function assertSafeAttachmentId(attachmentId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      attachmentId,
    )
  ) {
    throw new Error("Invalid attachment id.");
  }
}

export function hashBytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function safeExtension(extension: string, fallbackExtension: string) {
  const normalized = extension.toLowerCase();
  if (/^\.[a-z0-9][a-z0-9._-]{0,15}$/.test(normalized)) return normalized;
  return fallbackExtension;
}

export function sanitizeFileName(
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

export function detectImageMimeType(bytes: Uint8Array) {
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

export function hasZipSignature(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

export function normalizedDeclaredMimeType(mimeType?: string) {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  return normalized || null;
}

export function detectOfficeAttachment(
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

export function detectPdfAttachment(
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

export function detectByExtension(
  extension: string,
  isZipArchive: boolean,
): AttachmentDetection | null {
  const detection = mimeTypesByExtension.get(extension);
  if (!detection || !canTrustExtensionDetection(detection, isZipArchive)) {
    return null;
  }
  return detection;
}
