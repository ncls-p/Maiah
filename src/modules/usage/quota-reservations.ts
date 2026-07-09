import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getWorkspaceMonthlyTokenLimit } from "@/modules/usage/quota-config";
import { db } from "@/server/infrastructure/db";
import {
  agentRuns,
  usageEvents,
  workspaceTokenReservations,
} from "@/server/infrastructure/db/schema";

export class WorkspaceQuotaReservationError extends Error {
  readonly code = "WORKSPACE_TOKEN_QUOTA_EXCEEDED";

  constructor(
    readonly used: number,
    readonly reserved: number,
    readonly requested: number,
    readonly limit: number,
  ) {
    super(
      `Monthly token limit would be exceeded (${(used + reserved).toLocaleString()} used or reserved + ${requested.toLocaleString()} requested / ${limit.toLocaleString()}).`,
    );
    this.name = "WorkspaceQuotaReservationError";
  }
}

export function startOfQuotaMonth(now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function evaluateQuotaReservation(input: {
  limit: number | null;
  used: number;
  reserved: number;
  requested: number;
}) {
  const requested = Math.max(1, Math.floor(input.requested));
  const allowed =
    input.limit === null ||
    input.used + input.reserved + requested <= input.limit;
  return { ...input, requested, allowed };
}

export async function getActiveWorkspaceReservationTokens(
  workspaceId: string,
  now = new Date(),
) {
  const [result] = await db
    .select({
      total: sql<number>`coalesce(sum(${workspaceTokenReservations.reservedTokens}), 0)`,
    })
    .from(workspaceTokenReservations)
    .where(
      and(
        eq(workspaceTokenReservations.workspaceId, workspaceId),
        eq(workspaceTokenReservations.status, "active"),
        gte(workspaceTokenReservations.expiresAt, now),
      ),
    );
  return Number(result?.total ?? 0);
}

export async function reserveWorkspaceTokens(input: {
  workspaceId: string;
  runId: string;
  requestedTokens: number;
  expiresAt: Date;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const periodStart = startOfQuotaMonth(now);
  const requestedTokens = Math.max(1, Math.floor(input.requestedTokens));
  const limit = getWorkspaceMonthlyTokenLimit();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}))`,
    );

    const [existing] = await tx
      .select()
      .from(workspaceTokenReservations)
      .where(eq(workspaceTokenReservations.runId, input.runId))
      .limit(1);
    if (existing) return existing;

    const [[usage], [reservations]] = await Promise.all([
      tx
        .select({
          total: sql<number>`coalesce(sum(coalesce(${usageEvents.inputTokens}, 0) + coalesce(${usageEvents.outputTokens}, 0)), 0)`,
        })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.workspaceId, input.workspaceId),
            gte(usageEvents.createdAt, periodStart),
          ),
        ),
      tx
        .select({
          total: sql<number>`coalesce(sum(${workspaceTokenReservations.reservedTokens}), 0)`,
        })
        .from(workspaceTokenReservations)
        .where(
          and(
            eq(workspaceTokenReservations.workspaceId, input.workspaceId),
            eq(workspaceTokenReservations.status, "active"),
            gte(workspaceTokenReservations.expiresAt, now),
          ),
        ),
    ]);
    const used = Number(usage?.total ?? 0);
    const reserved = Number(reservations?.total ?? 0);
    const admission = evaluateQuotaReservation({
      limit,
      used,
      reserved,
      requested: requestedTokens,
    });
    if (!admission.allowed && limit !== null) {
      throw new WorkspaceQuotaReservationError(
        used,
        reserved,
        requestedTokens,
        limit,
      );
    }

    const [reservation] = await tx
      .insert(workspaceTokenReservations)
      .values({
        workspaceId: input.workspaceId,
        runId: input.runId,
        periodStart,
        reservedTokens: requestedTokens,
        expiresAt: input.expiresAt,
      })
      .returning();
    await tx
      .update(agentRuns)
      .set({ reservedTokens: requestedTokens, updatedAt: now })
      .where(eq(agentRuns.id, input.runId));
    return reservation;
  });
}

export async function settleWorkspaceTokenReservation(input: {
  runId: string;
  actualTokens: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const actualTokens = Math.max(0, Math.floor(input.actualTokens));
  await db.transaction(async (tx) => {
    await tx
      .update(workspaceTokenReservations)
      .set({ status: "settled", actualTokens, updatedAt: now })
      .where(
        and(
          eq(workspaceTokenReservations.runId, input.runId),
          eq(workspaceTokenReservations.status, "active"),
        ),
      );
    await tx
      .update(agentRuns)
      .set({ reservedTokens: 0, updatedAt: now })
      .where(eq(agentRuns.id, input.runId));
  });
}

export async function releaseWorkspaceTokenReservation(
  runId: string,
  now = new Date(),
) {
  await db.transaction(async (tx) => {
    await tx
      .update(workspaceTokenReservations)
      .set({ status: "released", updatedAt: now })
      .where(
        and(
          eq(workspaceTokenReservations.runId, runId),
          eq(workspaceTokenReservations.status, "active"),
        ),
      );
    await tx
      .update(agentRuns)
      .set({ reservedTokens: 0, updatedAt: now })
      .where(eq(agentRuns.id, runId));
  });
}

export async function expireWorkspaceTokenReservations(now = new Date()) {
  const expired = await db
    .update(workspaceTokenReservations)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(workspaceTokenReservations.status, "active"),
        lt(workspaceTokenReservations.expiresAt, now),
      ),
    )
    .returning({ runId: workspaceTokenReservations.runId });
  if (expired.length > 0) {
    await db
      .update(agentRuns)
      .set({ reservedTokens: 0, updatedAt: now })
      .where(
        inArray(
          agentRuns.id,
          expired.map((row) => row.runId),
        ),
      );
  }
  return expired.length;
}
