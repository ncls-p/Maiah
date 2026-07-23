import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { decryptValue, encryptValue } from "@/lib/crypto";
import { projectToolPayloadForDisplay } from "@/modules/tool/safe-payload";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { workflowAgentRunRequests } from "@/server/infrastructure/db/schema";

import { createWorkflowRun } from "./use-cases";

const MAX_RUN_INPUT_CHARS = 50_000;
const RUN_REQUEST_TTL_MS = 60 * 60 * 1_000;

export class WorkflowAgentRunDecisionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "WorkflowAgentRunDecisionError";
  }
}

export type WorkflowAgentRunRequest = {
  id: string;
  title: string;
  reason: string | null;
  inputPreview: unknown;
  expectedVersion: number;
  status: "pending";
  expiresAt: string;
};

function publicRequest(
  request: typeof workflowAgentRunRequests.$inferSelect,
): WorkflowAgentRunRequest {
  return {
    id: request.id,
    title: request.title,
    reason: request.reason,
    inputPreview: request.inputPreviewJson,
    expectedVersion: request.expectedVersion,
    status: "pending",
    expiresAt: request.expiresAt.toISOString(),
  };
}

function serializeRunInput(value: unknown) {
  let serialized: string;
  try {
    serialized = JSON.stringify(value ?? {});
  } catch {
    throw new WorkflowAgentRunDecisionError(
      "Workflow run input must be valid JSON.",
      400,
    );
  }
  if (serialized.length > MAX_RUN_INPUT_CHARS) {
    throw new WorkflowAgentRunDecisionError(
      "Workflow run input is too large.",
      400,
    );
  }
  return serialized;
}

export async function createWorkflowAgentRunRequest(input: {
  workflowId: string;
  workspaceId: string;
  userId: string;
  title: string;
  reason?: string;
  payload?: unknown;
  expectedVersion: number;
}) {
  const title = z.string().trim().min(1).max(255).parse(input.title);
  const reason = input.reason?.trim().slice(0, 1_000) || null;
  const serialized = serializeRunInput(input.payload);
  const [request] = await db
    .insert(workflowAgentRunRequests)
    .values({
      workflowId: input.workflowId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      title,
      reason,
      inputEncrypted: await encryptValue(serialized),
      inputPreviewJson: projectToolPayloadForDisplay(input.payload ?? {}),
      expectedVersion: z.number().int().positive().parse(input.expectedVersion),
      expiresAt: new Date(Date.now() + RUN_REQUEST_TTL_MS),
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "workflow.agentRunRequested",
    resourceType: "workflow_agent_run_request",
    resourceId: request.id,
    outcome: "success",
    metadata: {
      workflowId: input.workflowId,
      expectedVersion: request.expectedVersion,
    },
  });

  return publicRequest(request);
}

export async function getPendingWorkflowAgentRunRequests(input: {
  workflowId: string;
  workspaceId: string;
  userId: string;
}) {
  const rows = await db
    .select()
    .from(workflowAgentRunRequests)
    .where(
      and(
        eq(workflowAgentRunRequests.workflowId, input.workflowId),
        eq(workflowAgentRunRequests.workspaceId, input.workspaceId),
        eq(workflowAgentRunRequests.userId, input.userId),
        eq(workflowAgentRunRequests.status, "pending"),
      ),
    )
    .orderBy(desc(workflowAgentRunRequests.createdAt));
  return rows
    .filter((request) => request.expiresAt.getTime() > Date.now())
    .map(publicRequest);
}

async function loadRunRequest(input: {
  requestId: string;
  workflowId: string;
  workspaceId: string;
  userId: string;
}) {
  const [request] = await db
    .select()
    .from(workflowAgentRunRequests)
    .where(
      and(
        eq(workflowAgentRunRequests.id, input.requestId),
        eq(workflowAgentRunRequests.workflowId, input.workflowId),
        eq(workflowAgentRunRequests.workspaceId, input.workspaceId),
        eq(workflowAgentRunRequests.userId, input.userId),
      ),
    )
    .limit(1);
  if (!request) {
    throw new WorkflowAgentRunDecisionError(
      "Workflow run request not found.",
      404,
    );
  }
  return request;
}

export async function approveWorkflowAgentRunRequest(input: {
  requestId: string;
  workflowId: string;
  workspaceId: string;
  userId: string;
}) {
  const request = await loadRunRequest(input);
  if (request.status === "approved" && request.runId) {
    return {
      requestId: request.id,
      status: "approved" as const,
      runId: request.runId,
    };
  }
  if (request.status !== "pending") {
    throw new WorkflowAgentRunDecisionError(
      "Workflow run request has already been decided.",
    );
  }
  if (request.expiresAt.getTime() <= Date.now()) {
    await db
      .update(workflowAgentRunRequests)
      .set({ status: "expired", decidedAt: new Date() })
      .where(
        and(
          eq(workflowAgentRunRequests.id, request.id),
          eq(workflowAgentRunRequests.status, "pending"),
        ),
      );
    throw new WorkflowAgentRunDecisionError(
      "Workflow run request has expired.",
    );
  }

  const [claim] = await db
    .update(workflowAgentRunRequests)
    .set({ status: "approving", decidedAt: new Date() })
    .where(
      and(
        eq(workflowAgentRunRequests.id, request.id),
        eq(workflowAgentRunRequests.status, "pending"),
      ),
    )
    .returning();
  if (!claim) {
    throw new WorkflowAgentRunDecisionError(
      "Workflow run request is already being processed.",
    );
  }

  try {
    const payload = JSON.parse(await decryptValue(request.inputEncrypted));
    const run = await createWorkflowRun({
      workflowId: request.workflowId,
      workspaceId: request.workspaceId,
      userId: request.userId,
      payload,
      versionNumber: request.expectedVersion,
      idempotencyKey: `workflow-agent-run:${request.id}`,
      trigger: "agent",
    });
    await db
      .update(workflowAgentRunRequests)
      .set({ status: "approved", runId: run.id, error: null })
      .where(eq(workflowAgentRunRequests.id, request.id));
    await audit.emit({
      workspaceId: request.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.userId,
      action: "workflow.agentRunApproved",
      resourceType: "workflow_agent_run_request",
      resourceId: request.id,
      outcome: "success",
      metadata: {
        workflowId: request.workflowId,
        expectedVersion: request.expectedVersion,
        runId: run.id,
      },
    });
    return {
      requestId: request.id,
      status: "approved" as const,
      runId: run.id,
    };
  } catch (error) {
    await db
      .update(workflowAgentRunRequests)
      .set({
        status: "failed",
        error: "Workflow execution could not be started.",
      })
      .where(eq(workflowAgentRunRequests.id, request.id));
    await audit.emit({
      workspaceId: request.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.userId,
      action: "workflow.agentRunApproved",
      resourceType: "workflow_agent_run_request",
      resourceId: request.id,
      outcome: "failed",
      metadata: {
        workflowId: request.workflowId,
        expectedVersion: request.expectedVersion,
      },
    });
    throw error;
  }
}

export async function rejectWorkflowAgentRunRequest(input: {
  requestId: string;
  workflowId: string;
  workspaceId: string;
  userId: string;
}) {
  const request = await loadRunRequest(input);
  if (request.status === "rejected") {
    return { requestId: request.id, status: "rejected" as const };
  }
  if (request.status !== "pending") {
    throw new WorkflowAgentRunDecisionError(
      "Workflow run request has already been decided.",
    );
  }
  const [rejected] = await db
    .update(workflowAgentRunRequests)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(
      and(
        eq(workflowAgentRunRequests.id, request.id),
        eq(workflowAgentRunRequests.status, "pending"),
      ),
    )
    .returning();
  if (!rejected) {
    throw new WorkflowAgentRunDecisionError(
      "Workflow run request is already being processed.",
    );
  }
  await audit.emit({
    workspaceId: request.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "workflow.agentRunRejected",
    resourceType: "workflow_agent_run_request",
    resourceId: request.id,
    outcome: "success",
    metadata: {
      workflowId: request.workflowId,
      expectedVersion: request.expectedVersion,
    },
  });
  return { requestId: request.id, status: "rejected" as const };
}
