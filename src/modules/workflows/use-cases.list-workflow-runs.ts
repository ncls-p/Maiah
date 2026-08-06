import { and,asc,desc,eq,sql } from "drizzle-orm";
import type { FlowcraftEvent } from "flowcraft";

import { db } from "@/server/infrastructure/db";
import { workflowRuns,workflowRunSteps } from "@/server/infrastructure/db/schema";

import { type WorkflowDefinition } from "./contracts";
import { workflowNodeById } from "./runtime";
import { errorMessage,requireWorkflow,WorkflowNotFoundError } from "./use-cases.workflow-not-found-error";

export async function listWorkflowRuns(workflowId: string, workspaceId: string) {
  await requireWorkflow(workflowId, workspaceId);
  return db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.workspaceId, workspaceId)))
    .orderBy(desc(workflowRuns.queuedAt))
    .limit(50);
}

export async function getWorkflowRun(runId: string, workspaceId: string) {
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.workspaceId, workspaceId)))
    .limit(1);
  if (!run) throw new WorkflowNotFoundError("Workflow run not found");
  const steps = await db.select().from(workflowRunSteps).where(eq(workflowRunSteps.runId, run.id)).orderBy(asc(workflowRunSteps.startedAt));
  return { ...run, steps };
}

export async function persistRunEvent(input: { runId: string; definition: WorkflowDefinition; event: FlowcraftEvent }) {
  const { event, runId, definition } = input;
  if (event.type !== "node:start" && event.type !== "node:finish" && event.type !== "node:error" && event.type !== "node:retry" && event.type !== "node:skipped") {
    return;
  }
  const node = workflowNodeById(definition, event.payload.nodeId);
  if (!node) return;
  if (event.type === "node:start") {
    await db
      .insert(workflowRunSteps)
      .values({
        runId,
        nodeId: node.id,
        nodeType: node.type,
        status: "running",
        attempt: 1,
        inputJson: event.payload.input ?? null,
        startedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [workflowRunSteps.runId, workflowRunSteps.nodeId],
        set: {
          status: "running",
          inputJson: event.payload.input ?? null,
          startedAt: new Date(),
          completedAt: null,
          error: null,
          attempt: sql`${workflowRunSteps.attempt} + 1`,
        },
      });
    return;
  }
  if (event.type === "node:retry") {
    await db
      .update(workflowRunSteps)
      .set({ attempt: event.payload.attempt + 1 })
      .where(and(eq(workflowRunSteps.runId, runId), eq(workflowRunSteps.nodeId, node.id)));
    return;
  }
  const status = event.type === "node:finish" ? "completed" : event.type === "node:skipped" ? "skipped" : "failed";
  await db
    .update(workflowRunSteps)
    .set({
      status,
      ...(event.type === "node:finish" ? { outputJson: event.payload.result.output ?? null } : {}),
      ...(event.type === "node:error" ? { error: errorMessage(event.payload.error) } : {}),
      completedAt: new Date(),
    })
    .where(and(eq(workflowRunSteps.runId, runId), eq(workflowRunSteps.nodeId, node.id)));
}
