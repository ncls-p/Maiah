import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { decryptValue, encryptValue } from "@/lib/crypto";
import {
  projectToolMessagePayload,
  safeToolErrorMessage,
} from "@/modules/tool/safe-payload";
import { reserveWorkspaceTokens } from "@/modules/usage/quota-reservations";
import { db } from "@/server/infrastructure/db";
import {
  agentRuns,
  agentRunSteps,
  usageEvents,
  workspaceTokenReservations,
} from "@/server/infrastructure/db/schema";
import {
  AgentRunTerminalStatus,
  AgentRunUsageEvent,
} from "./run-use-cases.agent-run-trigger";

export async function failAgentRun(input: {
  runId: string;
  status?: Exclude<AgentRunTerminalStatus, "success">;
  error: unknown;
  errorCode?: string;
  inputTokens?: number;
  outputTokens?: number;
  reservationTokens?: number;
  usage?: AgentRunUsageEvent;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const status = input.status ?? "failed";
  const inputTokens = Math.max(0, input.inputTokens ?? 0);
  const outputTokens = Math.max(0, input.outputTokens ?? 0);
  const actualTokens = Math.max(
    0,
    Math.floor(input.reservationTokens ?? inputTokens + outputTokens),
  );

  return db.transaction(async (tx) => {
    const [run] = await tx
      .update(agentRuns)
      .set({
        status,
        errorCode: input.errorCode ?? "AGENT_RUN_FAILED",
        errorMessage: safeToolErrorMessage(input.error, "Agent run failed"),
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        reservedTokens: 0,
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
    if (!run) return null;

    await tx
      .update(workspaceTokenReservations)
      .set(
        actualTokens > 0
          ? { status: "settled", actualTokens, updatedAt: now }
          : { status: "released", updatedAt: now },
      )
      .where(
        and(
          eq(workspaceTokenReservations.runId, input.runId),
          eq(workspaceTokenReservations.status, "active"),
        ),
      );

    if (input.usage) {
      await tx.insert(usageEvents).values({
        workspaceId: input.usage.workspaceId,
        userId: input.usage.userId,
        providerId: input.usage.providerId ?? null,
        modelId: input.usage.modelId ?? null,
        agentId: input.usage.agentId,
        conversationId: input.usage.conversationId ?? null,
        operation: input.usage.operation,
        inputTokens: inputTokens || null,
        outputTokens: outputTokens || null,
        latencyMs: input.usage.latencyMs ?? null,
        status,
      });
    }

    return run;
  });
}

export async function requestAgentRunCancellation(
  runId: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const [queued] = await tx
      .update(agentRuns)
      .set({
        status: "cancelled",
        reservedTokens: 0,
        cancelRequestedAt: now,
        completedAt: now,
        updatedAt: now,
      })
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "queued")))
      .returning();
    if (queued) {
      await tx
        .update(workspaceTokenReservations)
        .set({ status: "released", updatedAt: now })
        .where(
          and(
            eq(workspaceTokenReservations.runId, runId),
            eq(workspaceTokenReservations.status, "active"),
          ),
        );
      return queued;
    }

    const [running] = await tx
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
  });
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
