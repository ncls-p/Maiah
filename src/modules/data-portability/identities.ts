import type { PoolClient } from "pg";
import type { Dataset } from "./registry";

// Global per-user rows: a reused identity keeps the destination copy (credentials,
// sessions, GitHub links, active project) instead of the archived one.
const identityTables = [
  "account",
  "session",
  "user_github_connections",
  "user_workspace_preferences",
] as const;

/**
 * Several organizations exported from the same source usually share members (at least
 * their creator). An archived user already present on the destination with the same
 * identifier AND the same email is that very identity, imported earlier: it is reused
 * rather than merged. Any other identifier or email collision is still refused.
 */
export async function reuseImportedIdentities(
  client: PoolClient,
  data: Dataset,
) {
  const ids = data.user.map((user) => String(user.id));
  if (!ids.length) return new Set<string>();
  const existing = await client.query<{ id: string; email: string }>(
    `select id::text as id, lower(email) as email from public."user" where id = any($1::uuid[])`,
    [ids],
  );
  const destination = new Map(existing.rows.map((row) => [row.id, row.email]));
  const reused = new Set<string>();
  for (const user of data.user) {
    const email = destination.get(String(user.id));
    if (email === undefined) continue;
    if (typeof user.email !== "string" || user.email.toLowerCase() !== email)
      throw new Error(
        "An archived user identifier already exists on the destination with another email; identities are never merged",
      );
    reused.add(String(user.id));
  }
  if (!reused.size) return reused;
  data.user = data.user.filter((user) => !reused.has(String(user.id)));
  const connections = new Set(
    data.user_github_connections
      .filter((row) => reused.has(String(row.user_id)))
      .map((row) => String(row.id)),
  );
  for (const table of identityTables)
    data[table] = data[table].filter((row) => !reused.has(String(row.user_id)));
  data.user_github_repositories = data.user_github_repositories.filter(
    (row) => !connections.has(String(row.connection_id)),
  );
  data.app_settings = data.app_settings.filter(
    (row) =>
      !(
        typeof row.key === "string" &&
        row.key.startsWith("onboarding.complete:") &&
        reused.has(row.key.slice("onboarding.complete:".length))
      ),
  );
  return reused;
}
