import { MAX_ARCHIVE_BYTES } from "./archive";

export const PORTABILITY_CONTENT_TYPE = "application/vnd.maiah.portability";
const MAX_FIELDS_BYTES = 64 * 1024;

/**
 * Body: 4-byte big-endian length, UTF-8 JSON fields, then the raw archive (if any).
 * The upload is read once into a single buffer; the archive is a view of it, never a copy.
 */
export async function readPortabilityRequest(request: Request) {
  if (request.headers.get("content-type") !== PORTABILITY_CONTENT_TYPE)
    throw new Error("Unsupported request format");
  const limit = MAX_ARCHIVE_BYTES + MAX_FIELDS_BYTES + 4;
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > limit)
    throw new Error("Upload limit exceeded");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  let buffer = Buffer.allocUnsafe(
    Number.isSafeInteger(declared) && declared > 0 ? declared : 64 * 1024,
  );
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.length > limit) {
        await reader.cancel();
        throw new Error("Upload limit exceeded");
      }
      if (length + value.length > buffer.length) {
        const grown = Buffer.allocUnsafe(
          Math.min(limit, Math.max(buffer.length * 2, length + value.length)),
        );
        buffer.copy(grown, 0, 0, length);
        buffer = grown;
      }
      buffer.set(value, length);
      length += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  if (length < 4) throw new Error("Invalid request body");
  const fieldsLength = buffer.readUInt32BE(0);
  if (fieldsLength > MAX_FIELDS_BYTES || 4 + fieldsLength > length)
    throw new Error("Invalid request body");
  let fields: unknown;
  try {
    fields = JSON.parse(buffer.toString("utf8", 4, 4 + fieldsLength));
  } catch {
    throw new Error("Invalid request body");
  } finally {
    buffer.fill(0, 4, 4 + fieldsLength);
  }
  const archive = buffer.subarray(4 + fieldsLength, length);
  return { fields, archive: archive.length ? archive : undefined };
}
