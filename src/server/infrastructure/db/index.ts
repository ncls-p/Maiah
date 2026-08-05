import { env } from "@/lib/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseSsl = env.NODE_ENV === "production" && env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "disable" ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined;

const globalDatabase = globalThis as typeof globalThis & {
  __maiahPostgresPool?: Pool;
};
const pool =
  globalDatabase.__maiahPostgresPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    ssl: databaseSsl,
    application_name: "maiah-web",
    idleTimeoutMillis: 30_000,
  });

globalDatabase.__maiahPostgresPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
