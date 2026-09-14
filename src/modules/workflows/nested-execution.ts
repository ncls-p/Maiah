import { and, eq, lt, sql } from "drizzle-orm";
import { hasResourcePermissionForRequest } from "@/modules/auth/workspace-access";
import { db } from "@/server/infrastructure/db";
import { workflowRuns } from "@/server/infrastructure/db/schema";
import {
  createWorkflowRun,
  getWorkflowDetail,
  getWorkflowRun,
  processWorkflowRun,
} from "./use-cases";

export async function executeNestedWorkflow(input: {
  workspaceId: string;
  userId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  targetWorkflowId: string;
  input: unknown;
  signal?: AbortSignal;
}) {
  input.signal?.throwIfAborted();
  if (
    !(await hasResourcePermissionForRequest(
      input.userId,
      input.workspaceId,
      "workflows.execute",
      "workflow",
      input.targetWorkflowId,
    ))
  )
    throw new Error("Missing permission to execute the child workflow");
  let ancestorId: string | null = input.runId;
  let rootRunId = input.runId;
  let depth = 0;
  const seen = new Set<string>();
  while (ancestorId) {
    if (++depth >= 5 || seen.has(ancestorId))
      throw new Error("Workflow chain depth limit reached (5 workflows)");
    seen.add(ancestorId);
    const ancestor = await getWorkflowRun(ancestorId, input.workspaceId);
    if (ancestor.workflowId === input.targetWorkflowId)
      throw new Error("Circular workflow calls are not allowed");
    rootRunId = ancestor.id;
    ancestorId = ancestor.parentRunId;
  }
  const target = await getWorkflowDetail(
    input.targetWorkflowId,
    input.workspaceId,
  );
  if (!target.activeVersion)
    throw new Error("Publish the child workflow before chaining it");
  const [reserved] = await db
    .update(workflowRuns)
    .set({ childRunsStarted: sql`${workflowRuns.childRunsStarted} + 1` })
    .where(
      and(
        eq(workflowRuns.id, rootRunId),
        eq(workflowRuns.workspaceId, input.workspaceId),
        lt(workflowRuns.childRunsStarted, 20),
      ),
    )
    .returning({ id: workflowRuns.id });
  if (!reserved)
    throw new Error("Workflow chain execution limit reached (20 child runs)");
  input.signal?.throwIfAborted();
  const run = await createWorkflowRun({
    workflowId: input.targetWorkflowId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    payload: input.input,
    useLatestDraft: false,
    trigger: "workflow",
    parentRunId: input.runId,
    inline: true,
    idempotencyKey: `workflow:${input.runId}:${input.nodeId}`,
  });
  // Run in this worker: parents waiting in the queue cannot starve their own children.
  const completed = await processWorkflowRun(run.id, { signal: input.signal });
  if (completed.status !== "completed")
    throw new Error(
      `Child workflow ${run.id} ${completed.status}: ${completed.error ?? "execution did not complete"}`,
    );
  return {
    workflowId: input.targetWorkflowId,
    runId: run.id,
    output: completed.outputJson,
  };
}
