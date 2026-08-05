import { encryptValue } from "@/lib/crypto";
import {
projectToolMessagePayload,
safeToolErrorMessage,
} from "@/modules/tool/safe-payload";
import { reserveWorkspaceTokens } from "@/modules/usage/quota-reservations";
import { db } from "@/server/infrastructure/db";
import {
agentRuns
} from "@/server/infrastructure/db/schema";
import { and,eq,gt,isNull } from "drizzle-orm";

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

export type AgentRunUsageEvent = {
  workspaceId: string;
  userId: string;
  providerId?: string;
  modelId?: string;
  agentId: string;
  conversationId?: string;
  operation: string;
  latencyMs?: number;
};

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
