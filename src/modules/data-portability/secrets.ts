import type { Dataset, Row, TableName } from "./registry";

const marker = "__maiah_portable_secret_v1";
// User-authored JSON may legitimately contain the marker key: such objects are escaped.
const escape = "__maiah_portable_escaped_v1";
export interface SecretCodec {
  decrypt(value: string): Promise<string>;
  encrypt(value: string): Promise<string>;
}
function isCiphertext(value: string) {
  if (!value.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(value);
    return (
      parsed &&
      typeof parsed.ct === "string" &&
      typeof parsed.iv === "string" &&
      typeof parsed.kid === "string"
    );
  } catch {
    return false;
  }
}
/**
 * Server-written ciphertext columns. A ciphertext that cannot be decrypted there is a
 * key problem and fails the export. Every other column is user or configuration data:
 * only values that really decrypt with the source key are rewrapped, anything else is
 * kept verbatim, so user text shaped like a ciphertext can never block an export.
 */
export function isEncryptedColumn(table: TableName, column: string, row: Row) {
  return (
    /^encrypted_|_encrypted$/.test(column) ||
    (table === "app_settings" &&
      column === "value_json" &&
      String(row.key).startsWith("microsoft-sso:"))
  );
}
async function exportValue(
  value: unknown,
  codec: SecretCodec,
  strict: boolean,
  depth: number,
): Promise<unknown> {
  if (depth > 100) throw new Error("Data nesting limit exceeded");
  if (typeof value === "string" && isCiphertext(value)) {
    try {
      return { [marker]: await codec.decrypt(value) };
    } catch (error) {
      if (strict) throw error;
      return value;
    }
  }
  if (Array.isArray(value)) {
    const entries = [];
    for (const entry of value)
      entries.push(await exportValue(entry, codec, strict, depth + 1));
    return entries;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = [];
    for (const [key, entry] of Object.entries(record))
      entries.push([key, await exportValue(entry, codec, strict, depth + 1)]);
    const result = Object.fromEntries(entries);
    return Object.hasOwn(record, marker) || Object.hasOwn(record, escape)
      ? { [escape]: result }
      : result;
  }
  return value;
}
async function importValue(
  value: unknown,
  codec: SecretCodec,
  depth: number,
): Promise<unknown> {
  if (depth > 100) throw new Error("Data nesting limit exceeded");
  if (Array.isArray(value)) {
    const entries = [];
    for (const entry of value)
      entries.push(await importValue(entry, codec, depth + 1));
    return entries;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    let target = record;
    if (keys.length === 1 && keys[0] === marker) {
      if (typeof record[marker] !== "string")
        throw new Error("Reserved portable secret marker");
      return codec.encrypt(record[marker]);
    }
    if (keys.length === 1 && keys[0] === escape) {
      const inner = record[escape];
      if (!inner || typeof inner !== "object" || Array.isArray(inner))
        throw new Error("Reserved portable secret marker");
      target = inner as Record<string, unknown>;
    } else if (keys.includes(marker) || keys.includes(escape))
      throw new Error("Reserved portable secret marker");
    const entries = [];
    for (const [key, entry] of Object.entries(target))
      entries.push([key, await importValue(entry, codec, depth + 1)]);
    return Object.fromEntries(entries);
  }
  return value;
}
/** Secrets are plaintext only inside the authenticated, passphrase-encrypted envelope. */
export async function transformSecrets(
  value: unknown,
  mode: "export" | "import",
  codec: SecretCodec,
  strict = false,
): Promise<unknown> {
  return mode === "export"
    ? exportValue(value, codec, strict, 0)
    : importValue(value, codec, 0);
}
/** Rewrap a dataset in place: rows are owned by the caller's working copy. */
export async function transformDatasetSecrets(
  data: Dataset,
  mode: "export" | "import",
  codec: SecretCodec,
) {
  for (const [table, rows] of Object.entries(data) as [TableName, Row[]][])
    for (const row of rows)
      for (const [column, value] of Object.entries(row))
        if (
          value !== null &&
          typeof value !== "number" &&
          value !== true &&
          value !== false
        )
          row[column] = await transformSecrets(
            value,
            mode,
            codec,
            isEncryptedColumn(table, column, row),
          );
  return data;
}
