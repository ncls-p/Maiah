import { and,eq } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import {
workflowRuns,
workflowVersions
} from "@/server/infrastructure/db/schema";

import {
compileWorkflowDefinition,
createWorkflowEventBus,
createWorkflowRuntime,
workflowNodeById,
} from "./runtime";
import { persistRunEvent } from "./use-cases.list-workflow-runs";
import { errorMessage,WorkflowNotFoundError } from "./use-cases.workflow-not-found-error";

export async function processWorkflowRun(runId: string) {
  const [record] = await db
    .select({ run: workflowRuns, version: workflowVersions })
    .from(workflowRuns)
    .innerJoin(
      workflowVersions,
      eq(workflowRuns.workflowVersionId, workflowVersions.id),
    )
    .where(eq(workflowRuns.id, runId))
    .limit(1);
  if (!record) throw new WorkflowNotFoundError("Workflow run not found");
  if (["completed", "cancelled"].includes(record.run.status)) return record.run;
  try {
    const { definition, blueprint } = compileWorkflowDefinition({
      workflowId: record.run.workflowId,
      version: record.version.version,
      definition: record.version.definitionJson,
    });
    await db
      .update(workflowRuns)
      .set({ status: "running", startedAt: new Date(), error: null })
      .where(eq(workflowRuns.id, runId));
    let failureDetail: string | null = null;
    const eventBus = createWorkflowEventBus((event) => {
      if (event.type === "node:error") {
        const node = workflowNodeById(definition, event.payload.nodeId);
        const detail = errorMessage(event.payload.error);
        failureDetail = `${node?.label ?? event.payload.nodeId} (${event.payload.nodeId}): ${detail}`;
      }
      return persistRunEvent({ runId, definition, event });
    });
    const runtime = createWorkflowRuntime({
      dependencies: {
        workspaceId: record.run.workspaceId,
        workflowId: record.run.workflowId,
        userId: record.run.triggeredById ?? "",
        runId,
      },
      eventBus,
    });
    const result = await runtime.run(
      blueprint,
      { input: record.run.inputJson ?? null },
      { strict: true, concurrency: 4 },
    );
    const completed = result.status === "completed";
    const failure =
      failureDetail ?? result.errors?.map((error) => error.message).join(" ");
    const [run] = await db
      .update(workflowRuns)
      .set({
        status: completed ? "completed" : "failed",
        outputJson: result.context,
        error: completed ? null : failure || `Workflow ${result.status}`,
        completedAt: new Date(),
      })
      .where(eq(workflowRuns.id, runId))
      .returning();
    return run;
  } catch (error) {
    await db
      .update(workflowRuns)
      .set({
        status: "failed",
        error: errorMessage(error),
        completedAt: new Date(),
      })
      .where(eq(workflowRuns.id, runId));
    throw error;
  }
}

export async function failQueuedWorkflowRun(runId: string, error: string) {
  const [run] = await db
    .update(workflowRuns)
    .set({
      status: "failed",
      error: errorMessage(error),
      completedAt: new Date(),
    })
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.status, "queued")))
    .returning();
  return run;
}

export async function listQueuedWorkflowRunIds() {
  const rows = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(eq(workflowRuns.status, "queued"))
    .limit(500);
  return rows.map(({ id }) => id);
}
