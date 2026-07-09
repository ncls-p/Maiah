import { and, desc, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { decryptValue, encryptValue } from "@/lib/crypto";
import {
  projectToolMessagePayload,
  safeToolErrorMessage,
} from "@/modules/tool/safe-payload";
import {
  expireWorkspaceTokenReservations,
  releaseWorkspaceTokenReservation,
  reserveWorkspaceTokens,
  settleWorkspaceTokenReservation,
} from "@/modules/usage/quota-reservations";
import { db } from "@/server/infrastructure/db";
import {
  agentRuns,
  agentRunSteps,
  workspaceTokenReservations,
} from "@/server/infrastructure/db/schema";

export type AgentRunTrigger =
  | "chat"
  | "scheduled"
  | "api"
  | "delegation"
  | "dry_run";
export type AgentRunTerminalStatus =
  | "success"
  | "failed"
  | "cancelled"
  | "timed_out";

export class AgentRunConflictError extends Error {
  readonly code = "AGENT_RUN_CONFLICT";
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function findIdempotentRun(input: {
  workspaceId: string;
  trigger: AgentRunTrigger;
  idempotencyKey?: string | null;
}) {
  if (!input.idempotencyKey) return null;
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, input.workspaceId),
        eq(agentRuns.trigger, input.trigger),
        eq(agentRuns.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  return run ?? null;
}

export async function createAgentRun(input: {
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  actorPrincipalType: string;
  actorPrincipalId: string;
  trigger: AgentRunTrigger;
  payload: unknown;
  requestedTokens: number;
  deadlineAt: Date;
  idempotencyKey?: string | null;
  rootRunId?: string;
  parentRunId?: string;
  conversationId?: string | null;
  messageId?: string | null;
  scheduledTaskId?: string | null;
  depth?: number;
}) {
  const existing = await findIdempotentRun(input);
  if (existing) return { run: existing, reused: true as const };

  const runId = crypto.randomUUID();
  let run: typeof agentRuns.$inferSelect;
  try {
    [run] = await db
      .insert(agentRuns)
      .values({
        id: runId,
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        rootRunId: input.rootRunId ?? runId,
        parentRunId: input.parentRunId ?? null,
        conversationId: input.conversationId ?? null,
        messageId: input.messageId ?? null,
        scheduledTaskId: input.scheduledTaskId ?? null,
        trigger: input.trigger,
        status: "queued",
        actorPrincipalType: input.actorPrincipalType,
        actorPrincipalId: input.actorPrincipalId,
        idempotencyKey: input.idempotencyKey ?? null,
        inputEncrypted: await encryptValue(
          JSON.stringify(input.payload ?? null),
        ),
        inputPreviewJson: projectToolMessagePayload(input.payload),
        depth: input.depth ?? 0,
        deadlineAt: input.deadlineAt,
      })
      .returning();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const concurrent = await findIdempotentRun(input);
      if (concurrent) return { run: concurrent, reused: true as const };
    }
    throw error;
  }

  if (!input.parentRunId) {
    try {
      await reserveWorkspaceTokens({
        workspaceId: input.workspaceId,
        runId: run.id,
        requestedTokens: input.requestedTokens,
        expiresAt: input.deadlineAt,
      });
      run = { ...run, reservedTokens: Math.max(1, input.requestedTokens) };
    } catch (error) {
      await db
        .update(agentRuns)
        .set({
          status: "failed",
          errorCode:
            typeof error === "object" && error !== null && "code" in error
              ? String(error.code)
              : "QUOTA_RESERVATION_FAILED",
          errorMessage: safeToolErrorMessage(error, "Token reservation failed"),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentRuns.id, run.id));
      throw error;
    }
  }

  return { run, reused: false as const };
}

export async function claimAgentRun(input: {
  runId: string;
  leaseOwner: string;
  leaseMs?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? 30_000));
  const [run] = await db
    .update(agentRuns)
    .set({
      status: "running",
      leaseOwner: input.leaseOwner,
      leaseExpiresAt,
      startedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentRuns.id, input.runId),
        isNull(agentRuns.cancelRequestedAt),
        gt(agentRuns.deadlineAt, now),
        eq(agentRuns.status, "queued"),
      ),
    )
    .returning();
  return run ?? null;
}

export async function heartbeatAgentRun(input: {
  runId: string;
  leaseOwner: string;
  leaseMs?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [run] = await db
    .update(agentRuns)
    .set({
      leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? 30_000)),
      updatedAt: now,
    })
    .where(
      and(
        eq(agentRuns.id, input.runId),
        eq(agentRuns.status, "running"),
        eq(agentRuns.leaseOwner, input.leaseOwner),
      ),
    )
    .returning({ id: agentRuns.id });
  return Boolean(run);
}

export async function appendAgentRunStep(input: {
  runId: string;
  sequence: number;
  kind: "model" | "tool" | "delegation" | "approval";
  status: typeof agentRuns.$inferSelect.status;
  name?: string | null;
  childRunId?: string | null;
  inputPreview?: unknown;
  outputPreview?: unknown;
  errorMessage?: string | null;
  completedAt?: Date | null;
}) {
  const [step] = await db
    .insert(agentRunSteps)
    .values({
      runId: input.runId,
      sequence: input.sequence,
      kind: input.kind,
      status: input.status,
      name: input.name ?? null,
      childRunId: input.childRunId ?? null,
      inputPreviewJson: projectToolMessagePayload(input.inputPreview),
      outputPreviewJson: projectToolMessagePayload(input.outputPreview),
      errorMessage: input.errorMessage
        ? safeToolErrorMessage(new Error(input.errorMessage), "Run step failed")
        : null,
      completedAt: input.completedAt ?? null,
    })
    .returning();
  return step;
}

export async function completeAgentRun(input: {
  runId: string;
  output: unknown;
  inputTokens: number;
  outputTokens: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [run] = await db
    .update(agentRuns)
    .set({
      status: "success",
      outputEncrypted: await encryptValue(JSON.stringify(input.output ?? null)),
      outputPreviewJson: projectToolMessagePayload(input.output),
      inputTokens: Math.max(0, input.inputTokens),
      outputTokens: Math.max(0, input.outputTokens),
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(agentRuns.id, input.runId), eq(agentRuns.status, "running")))
    .returning();
  if (!run) throw new AgentRunConflictError("Run is no longer executing");
  await settleWorkspaceTokenReservation({
    runId: input.runId,
    actualTokens: input.inputTokens + input.outputTokens,
    now,
  });
  return run;
}

export async function failAgentRun(input: {
  runId: string;
  status?: Exclude<AgentRunTerminalStatus, "success">;
  error: unknown;
  errorCode?: string;
  inputTokens?: number;
  outputTokens?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const status = input.status ?? "failed";
  const [run] = await db
    .update(agentRuns)
    .set({
      status,
      errorCode: input.errorCode ?? "AGENT_RUN_FAILED",
      errorMessage: safeToolErrorMessage(input.error, "Agent run failed"),
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentRuns.id, input.runId),
        inArray(agentRuns.status, ["queued", "running", "waiting_approval"]),
      ),
    )
    .returning();
  if (run) {
    const actualTokens = (input.inputTokens ?? 0) + (input.outputTokens ?? 0);
    if (actualTokens > 0) {
      await settleWorkspaceTokenReservation({
        runId: input.runId,
        actualTokens,
        now,
      });
    } else {
      await releaseWorkspaceTokenReservation(input.runId, now);
    }
  }
  return run ?? null;
}

export async function requestAgentRunCancellation(
  runId: string,
  now = new Date(),
) {
  const [queued] = await db
    .update(agentRuns)
    .set({
      status: "cancelled",
      cancelRequestedAt: now,
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "queued")))
    .returning();
  if (queued) {
    await releaseWorkspaceTokenReservation(runId, now);
    return queued;
  }

  const [running] = await db
    .update(agentRuns)
    .set({ cancelRequestedAt: now, updatedAt: now })
    .where(
      and(
        eq(agentRuns.id, runId),
        inArray(agentRuns.status, ["running", "waiting_approval"]),
      ),
    )
    .returning();
  return running ?? null;
}

export async function getAgentRun(runId: string, workspaceId: string) {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.workspaceId, workspaceId)))
    .limit(1);
  if (!run) return null;
  const steps = await db
    .select()
    .from(agentRunSteps)
    .where(eq(agentRunSteps.runId, runId))
    .orderBy(agentRunSteps.sequence);
  return {
    ...run,
    inputEncrypted: undefined,
    outputEncrypted: undefined,
    steps,
  };
}

export async function listAgentRuns(input: {
  workspaceId: string;
  agentId?: string;
  limit?: number;
}) {
  return db
    .select({
      id: agentRuns.id,
      agentId: agentRuns.agentId,
      agentVersionId: agentRuns.agentVersionId,
      rootRunId: agentRuns.rootRunId,
      parentRunId: agentRuns.parentRunId,
      trigger: agentRuns.trigger,
      status: agentRuns.status,
      depth: agentRuns.depth,
      inputPreviewJson: agentRuns.inputPreviewJson,
      outputPreviewJson: agentRuns.outputPreviewJson,
      inputTokens: agentRuns.inputTokens,
      outputTokens: agentRuns.outputTokens,
      errorCode: agentRuns.errorCode,
      errorMessage: agentRuns.errorMessage,
      startedAt: agentRuns.startedAt,
      completedAt: agentRuns.completedAt,
      createdAt: agentRuns.createdAt,
    })
    .from(agentRuns)
    .where(
      input.agentId
        ? and(
            eq(agentRuns.workspaceId, input.workspaceId),
            eq(agentRuns.agentId, input.agentId),
          )
        : eq(agentRuns.workspaceId, input.workspaceId),
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 100));
}

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
  await expireWorkspaceTokenReservations(now);
  const expired = await db
    .update(agentRuns)
    .set({
      status: "timed_out",
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

  const leaseLost = await db
    .update(agentRuns)
    .set({
      status: "failed",
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
    await db
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
}
