const marker = "__maiah_portable_secret_v1";
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
/** Secrets are plaintext only inside the authenticated, passphrase-encrypted envelope. */
export async function transformSecrets(
  value: unknown,
  mode: "export" | "import",
  codec: SecretCodec,
  depth = 0,
): Promise<unknown> {
  if (depth > 100) throw new Error("Data nesting limit exceeded");
  if (mode === "export" && typeof value === "string" && isCiphertext(value))
    return { [marker]: await codec.decrypt(value) };
  if (Array.isArray(value))
    return Promise.all(
      value.map((entry) => transformSecrets(entry, mode, codec, depth + 1)),
    );
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Object.hasOwn(record, marker)) {
      if (
        mode === "export" ||
        Object.keys(record).length !== 1 ||
        typeof record[marker] !== "string"
      )
        throw new Error("Reserved portable secret marker");
      return codec.encrypt(record[marker]);
    }
    const entries = [];
    for (const [key, entry] of Object.entries(record))
      entries.push([
        key,
        await transformSecrets(entry, mode, codec, depth + 1),
      ]);
    return Object.fromEntries(entries);
  }
  return value;
}
