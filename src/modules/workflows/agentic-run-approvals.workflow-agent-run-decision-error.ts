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

export async function loadRunRequest(input: {
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
