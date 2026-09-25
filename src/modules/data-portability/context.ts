import { S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { z } from "zod";
import { s3ObjectStore } from "./objects";
import type { PortabilityContext } from "./service";
import type { SecretCodec } from "./secrets";
import { authTokenCodec } from "./oauth-tokens";

export const connectionSchema = z
  .object({
    databaseUrl: z.string().min(1),
    databaseSsl: z.boolean().default(false),
    // Same semantics as DATABASE_SSL_REJECT_UNAUTHORIZED=false for the application pool.
    databaseSslRejectUnauthorized: z.boolean().default(true),
    encryptionKey: z.string().regex(/^[a-fA-F0-9]{64}$/),
    encryptionKeyId: z.string().min(1),
    authSecret: z.string().min(1),
    authSecrets: z
      .array(
        z
          .object({
            version: z.number().int().nonnegative(),
            value: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .optional(),
    storage: z
      .object({
        endpoint: z.url(),
        region: z.string(),
        bucket: z.string(),
        accessKeyId: z.string(),
        secretAccessKey: z.string(),
        forcePathStyle: z.boolean().default(true),
      })
      .strict(),
    prefixes: z
      .object({ attachments: z.string(), code: z.string() })
      .default({ attachments: "chat-attachments", code: "code-workspaces" }),
  })
  .strict();
export type ConnectionConfig = z.input<typeof connectionSchema>;

export function keyedSecretCodec(hex: string, keyId: string): SecretCodec {
  const key = crypto.subtle.importKey(
    "raw",
    Buffer.from(hex, "hex"),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return {
    async decrypt(value) {
      let payload: { kid: string; iv: string; ct: string };
      try {
        payload = JSON.parse(value);
      } catch {
        throw new Error("Invalid source encrypted value");
      }
      if (payload.kid !== keyId)
        throw new Error("Source encryption key ID mismatch");
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: Buffer.from(payload.iv, "base64") },
        await key,
        Buffer.from(payload.ct, "base64"),
      );
      return new TextDecoder().decode(plaintext);
    },
    async encrypt(value) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        await key,
        new TextEncoder().encode(value),
      );
      return JSON.stringify({
        ct: Buffer.from(ciphertext).toString("base64"),
        iv: Buffer.from(iv).toString("base64"),
        kid: keyId,
      });
    },
  };
}
export function connectPortability(input: ConnectionConfig) {
  const config = connectionSchema.parse(input);
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 2,
    ssl: config.databaseSsl
      ? { rejectUnauthorized: config.databaseSslRejectUnauthorized }
      : undefined,
  });
  const s3 = new S3Client({
    endpoint: config.storage.endpoint,
    region: config.storage.region,
    credentials: {
      accessKeyId: config.storage.accessKeyId,
      secretAccessKey: config.storage.secretAccessKey,
    },
    forcePathStyle: config.storage.forcePathStyle,
  });
  const context: PortabilityContext = {
    pool,
    objects: s3ObjectStore(s3, config.storage.bucket),
    secrets: keyedSecretCodec(config.encryptionKey, config.encryptionKeyId),
    authTokens: authTokenCodec(config.authSecret, config.authSecrets),
    prefixes: config.prefixes,
  };
  return {
    context,
    close: async () => {
      s3.destroy();
      await pool.end();
    },
  };
}
