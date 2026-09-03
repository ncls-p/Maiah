import { encryptValue } from "@/lib/crypto";
import {
  projectToolMessagePayload,
  safeToolErrorMessage,
} from "@/modules/tool/safe-payload";
import { db } from "@/server/infrastructure/db";
import {
  agentRuns,
  agentRunSteps,
  usageEvents,
  workspaceTokenReservations,
} from "@/server/infrastructure/db/schema";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  AgentRunConflictError,
  AgentRunUsageEvent,
} from "./run-use-cases.agent-run-trigger";

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
        isNull(agentRuns.cancelRequestedAt),
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
  reservationTokens?: number;
  usage?: AgentRunUsageEvent;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const outputEncrypted = await encryptValue(
    JSON.stringify(input.output ?? null),
  );
  const inputTokens = Math.max(0, input.inputTokens);
  const outputTokens = Math.max(0, input.outputTokens);
  const actualTokens = Math.max(
    0,
    Math.floor(input.reservationTokens ?? inputTokens + outputTokens),
  );

  return db.transaction(async (tx) => {
    const [run] = await tx
      .update(agentRuns)
      .set({
        status: "success",
        outputEncrypted,
        outputPreviewJson: projectToolMessagePayload(input.output),
        inputTokens,
        outputTokens,
        reservedTokens: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(agentRuns.id, input.runId), eq(agentRuns.status, "running")),
      )
      .returning();
    if (!run) throw new AgentRunConflictError("Run is no longer executing");

    await tx
      .update(workspaceTokenReservations)
      .set({ status: "settled", actualTokens, updatedAt: now })
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
        status: "success",
      });
    }

    return run;
  });
}

export async function consumeAgentRunDelegationBudget(input: {
  rootRunId: string;
  maxDelegations: number;
  now?: Date;
}) {
  const conditions = [
    eq(agentRuns.id, input.rootRunId),
    inArray(agentRuns.status, ["queued", "running"]),
  ];
  if (input.maxDelegations > 0) {
    conditions.push(lt(agentRuns.delegationCount, input.maxDelegations));
  }
  const [root] = await db
    .update(agentRuns)
    .set({
      delegationCount: sql`${agentRuns.delegationCount} + 1`,
      updatedAt: input.now ?? new Date(),
    })
    .where(and(...conditions))
    .returning({ delegationCount: agentRuns.delegationCount });
  return root?.delegationCount ?? null;
}
