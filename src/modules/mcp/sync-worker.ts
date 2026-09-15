import { sql } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { syncMcpTools } from "./use-cases.sync-mcp-tools";
let running = false;
export async function drainMcpSync() {
  if (running) return;
  running = true;
  try {
    await db.execute(
      sql`DELETE FROM mcp_oauth_attempts WHERE expires_at < now()`,
    );
    await db.execute(sql`INSERT INTO mcp_sync_state(server_id)
      SELECT id FROM mcp_servers WHERE enabled AND archived_at IS NULL AND transport <> 'stdio'
      ON CONFLICT DO NOTHING`);
    const due = await db.execute<{
      id: string;
      workspace_id: string;
      created_by_user_id: string;
    }>(sql`
      SELECT s.id,s.workspace_id,s.created_by_user_id FROM mcp_servers s JOIN mcp_sync_state q ON q.server_id=s.id
      WHERE s.enabled AND s.archived_at IS NULL AND s.transport <> 'stdio' AND q.next_sync_at <= now() AND (q.lease_until IS NULL OR q.lease_until <= now())
      ORDER BY q.next_sync_at LIMIT 10`);
    // At most two remote servers in flight. Each discovery has a bounded deadline.
    for (let i = 0; i < due.rows.length; i += 2)
      await Promise.allSettled(
        due.rows
          .slice(i, i + 2)
          .map((server) =>
            syncMcpTools(
              server.id,
              server.workspace_id,
              server.created_by_user_id,
              false,
              true,
            ),
          ),
      );
  } finally {
    running = false;
  }
}
