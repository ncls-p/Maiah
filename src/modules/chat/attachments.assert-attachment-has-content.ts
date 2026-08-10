import { randomUUID } from "node:crypto";
import "pdf-parse/worker";

import { storage } from "@/server/infrastructure/storage";
import {
  ChatAttachment,
  ChatAttachmentMetadata,
  ChatFileAttachment,
  ChatFileAttachmentMetadata,
  ChatImageAttachment,
  ChatImageAttachmentMetadata,
  imageTypes,
  unsupportedChatImageTypeMessage,
} from "./attachments.chat-image-attachment";
import {
  chatAttachmentObjectKey,
  detectImageMimeType,
  extractedTextObjectKey,
  hashBytes,
  metadataObjectKey,
  safeExtension,
  sanitizeFileName,
} from "./attachments.code-text-extensions";
import { detectAttachment } from "./attachments.detect-attachment";
import { extractAttachmentText } from "./attachments.extract-attachment-text";
import { publicChatImageAttachment } from "./attachments.public-chat-image-attachment";

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

export function assertAttachmentHasContent(bytes: Uint8Array) {
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
