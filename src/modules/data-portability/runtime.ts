import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "@/lib/env";
import { connectPortability, type ConnectionConfig } from "./context";

export function runtimeConnection(): ConnectionConfig {
  return {
    databaseUrl: env.DATABASE_URL,
    databaseSsl:
      env.NODE_ENV === "production" &&
      env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "disable",
    databaseSslRejectUnauthorized:
      env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    encryptionKey: env.APP_ENCRYPTION_KEY,
    encryptionKeyId: env.APP_ENCRYPTION_KEY_ID,
    authSecret: env.BETTER_AUTH_SECRET,
    authSecrets: process.env.BETTER_AUTH_SECRETS?.split(",").map((entry) => {
      const separator = entry.indexOf(":");
      return {
        version: Number(entry.slice(0, separator)),
        value: entry.slice(separator + 1),
      };
    }),
    storage: {
      endpoint: env.OBJECT_STORAGE_ENDPOINT,
      region: env.OBJECT_STORAGE_REGION,
      bucket: env.OBJECT_STORAGE_BUCKET,
      accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
    },
    prefixes: {
      attachments:
        process.env.CHAT_ATTACHMENT_STORAGE_PREFIX ?? "chat-attachments",
      code: process.env.CODE_WORKSPACE_STORAGE_PREFIX ?? "code-workspaces",
    },
  };
}
export async function assertPortabilityMaintenance() {
  if (process.env.DATA_PORTABILITY_MAINTENANCE !== "true")
    throw new Error(
      "Pause writers/workers and set DATA_PORTABILITY_MAINTENANCE=true before migrating data",
    );
  const roots = [
    process.env.CODE_WORKSPACE_DIR,
    path.join(os.tmpdir(), "ai-hub", "code-workspaces"),
    path.join(process.cwd(), ".data", "code-workspaces"),
  ];
  for (const root of roots)
    if (root) {
      try {
        if ((await readdir(root)).length)
          throw new Error(
            "Legacy local code-workspace files must be migrated into object storage before export",
          );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
}
export function connectRuntimePortability() {
  return connectPortability(runtimeConnection());
}
