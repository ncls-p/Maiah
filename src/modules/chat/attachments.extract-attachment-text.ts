import "pdf-parse/worker";

import { logHandledWarning } from "@/lib/logger";
import { extractDocument } from "@/modules/document-extraction/service";
import type { RagConfig } from "@/modules/knowledge/rag-config-schema";
import { assertAttachmentHasContent } from "./attachments.assert-attachment-has-content";
import {
AttachmentDetection,
ChatAttachmentMetadata,
ChatFileAttachment,
ChatImageAttachment,
ExtractedText,
maxMarkdownConversionSourceChars,
utf8Decoder,
} from "./attachments.chat-image-attachment";
import { detectAttachment,limitExtractedText } from "./attachments.detect-attachment";
import {
extractOfficeText,
extractPdfMarkdown,
stripRtf,
} from "./attachments.extract-office-text";
import { textAttachmentToMarkdown } from "./attachments.markdown-table";

export async function extractAttachmentText(input: {
  bytes: Uint8Array;
  detection: AttachmentDetection;
  fileName: string;
  workspaceId?: string;
  config?: RagConfig;
}): Promise<ExtractedText> {
  try {
    const document = await extractDocument({
      workspaceId: input.workspaceId,
      fileName: input.fileName,
      mimeType: input.detection.mimeType,
      bytes: input.bytes,
      config: input.config,
    });
    if (document) {
      return limitExtractedText(
        document.markdown,
        document.warnings.length > 0
          ? document.warnings.join(" ")
          : document.markdown
            ? undefined
            : "AnyDoc found no deterministic text. Enable OCR to read scanned or visual regions.",
      );
    }
  } catch (error) {
    // Malformed but recoverable legacy office files can still be read by the
    // bounded XML fallback. Valid supported documents always use AnyDoc.
    logHandledWarning("AnyDoc extraction failed; trying safe legacy fallback", {
      mimeType: input.detection.mimeType,
      extension: input.detection.extension,
      size: input.bytes.byteLength,
      error: error instanceof Error ? error.message : String(error),
    });
  }

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

export type ExtractedUploadedFile = {
  text: string;
  mimeType: string;
  extension: string;
  status: ChatFileAttachment["extractionStatus"];
  message?: string;
};

/** Extract a supported upload without persisting it as a chat attachment. */
export async function extractUploadedFileText(input: {
  workspaceId?: string;
  config?: RagConfig;
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array;
}): Promise<ExtractedUploadedFile> {
  assertAttachmentHasContent(input.bytes);
  const detection = detectAttachment({
    fileName: input.fileName,
    declaredMimeType: input.mimeType,
    bytes: input.bytes,
  });
  const extracted = await extractAttachmentText({
    bytes: input.bytes,
    detection,
    fileName: input.fileName,
    workspaceId: input.workspaceId,
    config: input.config,
  });
  return {
    ...extracted,
    mimeType: detection.mimeType,
    extension: detection.extension,
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

export function assertChatAttachmentAccess(
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
