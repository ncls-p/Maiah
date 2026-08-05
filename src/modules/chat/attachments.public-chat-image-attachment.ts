import "pdf-parse/worker";

import { storage } from "@/server/infrastructure/storage";
import {
ChatAttachmentMetadata,
ChatFileAttachmentMetadata,
ChatImageAttachment,
ChatImageAttachmentMetadata,
} from "./attachments.chat-image-attachment";
import {
assertSafeAttachmentId,
metadataObjectKey
} from "./attachments.code-text-extensions";
import { assertChatAttachmentAccess } from "./attachments.extract-attachment-text";

export function publicChatImageAttachment(
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
