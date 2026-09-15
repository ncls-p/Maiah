import { randomUUID } from "node:crypto";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { mcpSyncState } from "@/server/infrastructure/db/schema";
export function syncDelayMs(failures: number, random = Math.random()) {
  const base = failures
    ? Math.min(6 * 60 * 60_000, 15 * 60_000 * 2 ** Math.min(failures, 5))
    : 15 * 60_000;
  return Math.round(base * (0.9 + 0.2 * random));
}
export async function scheduledSync<T extends { status: string }>(
  serverId: string,
  scheduled: boolean,
  run: () => Promise<T>,
) {
  await db.insert(mcpSyncState).values({ serverId }).onConflictDoNothing();
  const leaseId = randomUUID();
  const now = new Date();
  const [claimed] = await db
    .update(mcpSyncState)
    .set({ leaseId, leaseUntil: new Date(Date.now() + 120_000) })
    .where(
      and(
        eq(mcpSyncState.serverId, serverId),
        or(isNull(mcpSyncState.leaseUntil), lte(mcpSyncState.leaseUntil, now)),
        scheduled ? lte(mcpSyncState.nextSyncAt, now) : undefined,
      ),
    )
    .returning();
  if (!claimed) return { status: "syncing", discovered: 0 };
  let result: T | undefined;
  try {
    result = await run();
  } finally {
    const ok = result?.status === "healthy";
    const failures = ok ? 0 : claimed.failures + 1;
    await db
      .update(mcpSyncState)
      .set({
        failures,
        nextSyncAt: new Date(Date.now() + syncDelayMs(failures)),
        lastSuccessAt: ok ? new Date() : claimed.lastSuccessAt,
        lastError: ok ? null : "MCP_SYNC_FAILED",
        leaseId: null,
        leaseUntil: null,
      })
      .where(
        and(
          eq(mcpSyncState.serverId, serverId),
          eq(mcpSyncState.leaseId, leaseId),
        ),
      );
  }
  return result;
}
