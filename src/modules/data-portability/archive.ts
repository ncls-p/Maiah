import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
} from "node:crypto";
import { z } from "zod";
import {
  schemaFingerprint,
  tableNames,
  tables,
  type Dataset,
} from "./registry";

export const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
export const MAX_ROWS = 100_000;
const magic = Buffer.from("MAIAHD01");
const kdf = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, kdf, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}
export const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const objectSchema = z
  .object({
    key: z.string().min(1).max(1024),
    contentType: z.string().max(256),
    bytes: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const snapshotSchema = z
  .object({
    format: z.literal("maiah.data"),
    version: z.literal(1),
    schema: z.literal(schemaFingerprint),
    createdAt: z.iso.datetime(),
    scope: z.discriminatedUnion("type", [
      z.object({ type: z.literal("instance") }).strict(),
      z
        .object({ type: z.literal("organization"), organizationId: z.uuid() })
        .strict(),
    ]),
    prefixes: z.object({ attachments: z.string(), code: z.string() }).strict(),
    data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    objects: z.array(objectSchema).max(20_000),
  })
  .strict();
export type Snapshot = Omit<z.infer<typeof snapshotSchema>, "data"> & {
  data: Dataset;
};
export type Scope = Snapshot["scope"];

// Snapshots produced by this module are validated once; re-validation would decode
// every object again.
const validated = new WeakSet<object>();
const base64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function validateSnapshot(value: unknown): Snapshot {
  if (value && typeof value === "object" && validated.has(value))
    return value as Snapshot;
  const parsed = snapshotSchema.parse(value);
  if (
    JSON.stringify(Object.keys(parsed.data).sort()) !==
    JSON.stringify([...tableNames].sort())
  )
    throw new Error("Incomplete or unknown table inventory");
  let count = 0;
  for (const table of tables) {
    const columns = table.columns.map((column) => column.name).sort();
    for (const row of parsed.data[table.name]) {
      if (++count > MAX_ROWS) throw new Error("Archive row limit exceeded");
      if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(columns))
        throw new Error(`Invalid columns in ${table.name}`);
    }
  }
  const keys = new Set<string>();
  for (const object of parsed.objects) {
    if (
      keys.has(object.key) ||
      object.key.startsWith("/") ||
      object.key.includes("\\") ||
      object.key.split("/").some((part) => part === "." || part === "..") ||
      /[\x00-\x1f]/.test(object.key)
    )
      throw new Error("Unsafe or duplicate object key");
    keys.add(object.key);
    if (
      !base64.test(object.bytes) ||
      digest(Buffer.from(object.bytes, "base64")) !== object.sha256
    )
      throw new Error("Object integrity check failed");
  }
  validated.add(parsed);
  return parsed as Snapshot;
}

function checkPassword(password: string) {
  if (password.length < 16 || password.length > 1024)
    throw new Error("Archive passphrase must contain 16 to 1024 characters");
}
export async function sealSnapshot(
  snapshot: Snapshot,
  password: string,
): Promise<Buffer> {
  checkPassword(password);
  const payload = Buffer.from(JSON.stringify(snapshot));
  if (payload.length > MAX_ARCHIVE_BYTES - 52)
    throw new Error(
      "Archive exceeds the 128 MiB safety limit; nothing was truncated",
    );
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const key = await derive(password, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(magic);
  const ciphertext = cipher.update(payload);
  const final = cipher.final();
  key.fill(0);
  payload.fill(0);
  return Buffer.concat([
    magic,
    salt,
    iv,
    cipher.getAuthTag(),
    ciphertext,
    final,
  ]);
}
export async function openSnapshot(
  bytes: Buffer,
  password: string,
): Promise<Snapshot> {
  checkPassword(password);
  if (
    bytes.length < 52 ||
    bytes.length > MAX_ARCHIVE_BYTES ||
    !bytes.subarray(0, 8).equals(magic)
  )
    throw new Error("Invalid archive or archive size limit exceeded");
  const key = await derive(password, bytes.subarray(8, 24));
  let payload: Buffer | undefined;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      bytes.subarray(24, 36),
    );
    decipher.setAAD(magic);
    decipher.setAuthTag(bytes.subarray(36, 52));
    payload = decipher.update(bytes.subarray(52));
    // GCM emits no trailing block: final() only authenticates the tag.
    decipher.final();
  } catch {
    payload?.fill(0);
    throw new Error("Incorrect passphrase or damaged archive");
  } finally {
    key.fill(0);
  }
  const plaintext = payload as Buffer;
  try {
    return validateSnapshot(JSON.parse(plaintext.toString("utf8")));
  } finally {
    plaintext.fill(0);
  }
}

export const restorationNotice = [
  "All registered tables and selected objects are included, including credentials, users and usage.",
  "Existing rows and objects are never overwritten. Any conflict blocks the import.",
  "Identifiers are preserved, except equivalent built-in roles are mapped by name. Migration defaults are replaced only on an otherwise empty instance target.",
  "Organization imports require an existing destination platform administrator. Cross-organization dependencies require an instance export.",
  "Sessions, verification challenges and pending authorizations expire; scheduled tasks and integrations are paused.",
  "Credentials and API keys are retained. Revoke them on the old instance after validating the migration.",
  "Infrastructure environment variables, Redis queues/caches and external service data are not part of the application archive.",
];
export function summarize(snapshot: Snapshot) {
  return {
    scope: snapshot.scope,
    createdAt: snapshot.createdAt,
    tables: Object.fromEntries(
      tableNames.map((name) => [name, snapshot.data[name].length]),
    ),
    rows: Object.values(snapshot.data).reduce(
      (sum, rows) => sum + rows.length,
      0,
    ),
    objects: snapshot.objects.length,
    objectBytes: snapshot.objects.reduce(
      (sum, object) => sum + Buffer.byteLength(object.bytes, "base64"),
      0,
    ),
    notices: restorationNotice,
  };
}
