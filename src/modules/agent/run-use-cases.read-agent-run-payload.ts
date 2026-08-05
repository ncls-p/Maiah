import { decryptValue } from "@/lib/crypto";
import { db } from "@/server/infrastructure/db";
import {
agentRuns,
workspaceTokenReservations
} from "@/server/infrastructure/db/schema";
import { and,eq,inArray,lt } from "drizzle-orm";

export async function readAgentRunPayload(runId: string) {
  const [run] = await db
    .select({
      inputEncrypted: agentRuns.inputEncrypted,
      outputEncrypted: agentRuns.outputEncrypted,
    })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);
  if (!run) return null;
  return {
    input: JSON.parse(await decryptValue(run.inputEncrypted)) as unknown,
    output: run.outputEncrypted
      ? (JSON.parse(await decryptValue(run.outputEncrypted)) as unknown)
      : null,
  };
}

export async function reapExpiredAgentRuns(now = new Date()) {
  return db.transaction(async (tx) => {
    const expiredReservations = await tx
      .update(workspaceTokenReservations)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(workspaceTokenReservations.status, "active"),
          lt(workspaceTokenReservations.expiresAt, now),
        ),
      )
      .returning({ runId: workspaceTokenReservations.runId });
    if (expiredReservations.length > 0) {
      await tx
        .update(agentRuns)
        .set({ reservedTokens: 0, updatedAt: now })
        .where(
          inArray(
            agentRuns.id,
            expiredReservations.map((row) => row.runId),
          ),
        );
    }

    const expired = await tx
      .update(agentRuns)
      .set({
        status: "timed_out",
        reservedTokens: 0,
        errorCode: "AGENT_RUN_DEADLINE_EXCEEDED",
        errorMessage: "Agent run exceeded its deadline",
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(agentRuns.status, ["queued", "running", "waiting_approval"]),
          lt(agentRuns.deadlineAt, now),
        ),
      )
      .returning({ id: agentRuns.id });

    const leaseLost = await tx
      .update(agentRuns)
      .set({
        status: "failed",
        reservedTokens: 0,
        errorCode: "AGENT_RUN_LEASE_EXPIRED",
        errorMessage: "Agent worker lease expired before completion",
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(agentRuns.status, "running"), lt(agentRuns.leaseExpiresAt, now)),
      )
      .returning({ id: agentRuns.id });

    const terminalRunIds = [...expired, ...leaseLost].map((row) => row.id);
    if (terminalRunIds.length > 0) {
      await tx
        .update(workspaceTokenReservations)
        .set({ status: "expired", updatedAt: now })
        .where(
          and(
            inArray(workspaceTokenReservations.runId, terminalRunIds),
            eq(workspaceTokenReservations.status, "active"),
          ),
        );
    }
    return { timedOut: expired.length, leaseExpired: leaseLost.length };
  });
}
