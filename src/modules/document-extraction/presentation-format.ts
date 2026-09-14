/** MIME detection survives renaming a knowledge document without its extension. */
export function presentationExtension(
  fileName: string,
  mimeType?: string | null,
) {
  const mime = mimeType?.split(";", 1)[0].trim().toLowerCase();
  if (mime === "application/vnd.ms-powerpoint") return "ppt";
  if (mime === "application/vnd.oasis.opendocument.presentation") return "odp";
  if (mime?.includes("presentationml") || mime?.includes("powerpoint."))
    return "pptx";
  return (
    fileName
      .match(/\.(pptx?|pptm|ppsx?|ppsm|potx?|potm|odp)$/i)?.[1]
      .toLowerCase() ?? null
  );
}
