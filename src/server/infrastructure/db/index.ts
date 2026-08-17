import { env } from "@/lib/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseSsl =
  env.NODE_ENV === "production" &&
  env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "disable"
    ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined;

const globalDatabase = globalThis as typeof globalThis & {
  __maiahPostgresPool?: Pool;
  __maiahPostgresAdvisoryLockPool?: Pool;
};
const poolOptions = {
  connectionString: env.DATABASE_URL,
  ssl: databaseSsl,
  idleTimeoutMillis: 30_000,
} as const;
const pool =
  globalDatabase.__maiahPostgresPool ??
  new Pool({
    ...poolOptions,
    application_name: "maiah-web",
  });
const advisoryLockPool =
  globalDatabase.__maiahPostgresAdvisoryLockPool ??
  new Pool({
    ...poolOptions,
    application_name: "maiah-web-advisory-locks",
    // Lock waiters must never consume every connection used by application
    // queries. A dedicated, deliberately small pool removes that dependency.
    max: 2,
  });

globalDatabase.__maiahPostgresPool = pool;
globalDatabase.__maiahPostgresAdvisoryLockPool = advisoryLockPool;

export const db = drizzle(pool, { schema });
export { schema };

export async function withPostgresAdvisoryLock<T>(
  key: string,
  callback: () => Promise<T>,
): Promise<T> {
  const client = await advisoryLockPool.connect();
  let acquired = false;
  let destroyClient = false;
  try {
    await client.query(
      "select pg_advisory_lock(hashtextextended($1::text, 0))",
      [key],
    );
    acquired = true;
    return await callback();
  } finally {
    if (acquired) {
      try {
        const result = await client.query<{ unlocked: boolean }>(
          "select pg_advisory_unlock(hashtextextended($1::text, 0)) as unlocked",
          [key],
        );
        destroyClient = result.rows[0]?.unlocked !== true;
      } catch {
        // Destroying the session releases every session-level advisory lock.
        destroyClient = true;
      }
    }
    client.release(destroyClient);
  }
}
