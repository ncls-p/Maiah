import { and,eq } from "drizzle-orm";

import { decryptValue } from "@/lib/crypto";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { workflowAgentRunRequests } from "@/server/infrastructure/db/schema";

import {
WorkflowAgentRunDecisionError,
loadRunRequest,
} from "./agentic-run-approvals.workflow-agent-run-decision-error";
import { createWorkflowRun } from "./use-cases";

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
