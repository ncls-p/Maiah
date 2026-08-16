export const PASTED_TEXT_UPLOAD_THRESHOLD = 1_000;

export function shouldUploadPastedText(content: string) {
  return content.length > PASTED_TEXT_UPLOAD_THRESHOLD;
}

export function createPastedTextUploadFile(
  content: string,
  createdAt = new Date(),
) {
  const timestamp = createdAt.toISOString().replace(/[:.]/g, "-");
  return new File([content], `pasted-text-${timestamp}.txt`, {
    type: "text/plain",
  });
}
