import {
  isChatFileAttachment,
  type ChatAttachment,
} from "@/modules/chat/attachments";

export function buildConversationAttachmentContext(
  attachments: ChatAttachment[],
) {
  if (attachments.length === 0) return null;

  const inventory = attachments.map((attachment) => {
    const extraction = isChatFileAttachment(attachment)
      ? attachment.extractedTextChars > 0
        ? `, ${attachment.extractedTextChars} extracted text characters`
        : ", no extracted text"
      : "";
    return `- ${attachment.fileName} — Attachment ID: ${attachment.id}, MIME type: ${attachment.mimeType}${extraction}`;
  });

  return [
    "Files attached earlier in this conversation remain available on follow-up and regenerated turns.",
    "Accessible conversation attachments:",
    ...inventory,
    "When the user refers to one of these files, treat it as attached and available. Use its Attachment ID with an appropriate tool such as run_code_sandbox when its contents must be inspected; do not claim that no file was attached and do not ask the user to upload it again.",
  ].join("\n");
}
