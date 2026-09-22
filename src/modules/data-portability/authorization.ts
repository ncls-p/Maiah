import type { PoolClient } from "pg";

/** Run under the same table locks as the export/import, after receiving the archive. */
export function authorizePortabilitySession(userId: string, sessionId: string) {
  return async (client: PoolClient) => {
    const result = await client.query(
      `select 1 from public."user" u join public.session s on s.user_id = u.id
       where u.id = $1 and s.id = $2 and u.role = 'admin' and u.banned = false
       and s.expires_at > now() and s.impersonated_by is null`,
      [userId, sessionId],
    );
    if (result.rowCount !== 1)
      throw new Error(
        "Administrator session was revoked, expired or impersonated",
      );
  };
}
