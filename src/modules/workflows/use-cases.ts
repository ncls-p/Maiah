import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FlowcraftEvent } from "flowcraft";

import { db } from "@/server/infrastructure/db";
import {
  workflowRuns,
  workflowRunSteps,
  workflows,
  workflowVersions,
} from "@/server/infrastructure/db/schema";

import {
  createStarterDefinition,
  workflowDefinitionSchema,
  type WorkflowDefinition,
} from "./contracts";
import { enqueueWorkflowRun } from "./queue";
import {
  compileWorkflowDefinition,
  createWorkflowEventBus,
  createWorkflowRuntime,
  workflowNodeById,
} from "./runtime";

export class WorkflowNotFoundError extends Error {}
export class WorkflowConflictError extends Error {}
export class WorkflowQueueError extends Error {}

type CreateWorkflowInput = {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string | null;
};

type UpdateWorkflowInput = {
  workflowId: string;
  workspaceId: string;
  userId: string;
  name?: string;
  description?: string | null;
  definition?: WorkflowDefinition;
};

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    8_000,
  );
}

async function findIdempotentWorkflowRun(input: {
  workflowId: string;
  idempotencyKey?: string;
}) {
  if (!input.idempotencyKey) return null;
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workflowId, input.workflowId),
        eq(workflowRuns.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  return run ?? null;
}

async function requireWorkflow(workflowId: string, workspaceId: string) {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(
      and(eq(workflows.id, workflowId), eq(workflows.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!workflow || workflow.status === "archived") {
    throw new WorkflowNotFoundError("Workflow not found");
  }
  return workflow;
}

export async function listWorkflows(workspaceId: string) {
  return db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.workspaceId, workspaceId),
        sql`${workflows.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(workflows.updatedAt));
}

export async function getWorkflowDetail(
  workflowId: string,
  workspaceId: string,
) {
  const workflow = await requireWorkflow(workflowId, workspaceId);
  const [version] = await db
    .select()
    .from(workflowVersions)
    .where(
      and(
        eq(workflowVersions.workflowId, workflow.id),
        eq(workflowVersions.version, workflow.latestVersion),
      ),
    )
    .limit(1);
  if (!version) throw new WorkflowConflictError("Workflow version is missing");
  return {
    ...workflow,
    version: version.version,
    definition: workflowDefinitionSchema.parse(version.definitionJson),
  };
}

export async function createWorkflow(input: CreateWorkflowInput) {
  const definition = createStarterDefinition();
  return db.transaction(async (tx) => {
    const [workflow] = await tx
      .insert(workflows)
      .values({
        workspaceId: input.workspaceId,
        createdById: input.userId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    if (!workflow) throw new Error("Failed to create workflow");
    await tx.insert(workflowVersions).values({
      workflowId: workflow.id,
      version: 1,
      definitionJson: definition,
      createdById: input.userId,
    });
    return { ...workflow, version: 1, definition };
  });
}

export async function updateWorkflow(input: UpdateWorkflowInput) {
  const existing = await requireWorkflow(input.workflowId, input.workspaceId);
  return db.transaction(async (tx) => {
    const [workflow] = await tx
      .update(workflows)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.definition ? { status: "draft" as const } : {}),
        ...(input.definition
          ? {
              latestVersion: sql<number>`${workflows.latestVersion} + 1`,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflows.id, existing.id),
          eq(workflows.workspaceId, input.workspaceId),
          sql`${workflows.status} <> 'archived'`,
        ),
      )
      .returning();
    if (!workflow) throw new WorkflowNotFoundError("Workflow not found");

    if (input.definition) {
      await tx.insert(workflowVersions).values({
        workflowId: existing.id,
        version: workflow.latestVersion,
        definitionJson: input.definition,
        createdById: input.userId,
      });
    }

    let definition = input.definition;
    if (!definition) {
      const [version] = await tx
        .select({ definitionJson: workflowVersions.definitionJson })
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.workflowId, existing.id),
            eq(workflowVersions.version, workflow.latestVersion),
          ),
        )
        .limit(1);
      if (!version) {
        throw new WorkflowConflictError("Workflow version is missing");
      }
      definition = workflowDefinitionSchema.parse(version.definitionJson);
    }

    return {
      ...workflow,
      version: workflow.latestVersion,
      definition,
    };
  });
}

export async function publishWorkflow(workflowId: string, workspaceId: string) {
  const detail = await getWorkflowDetail(workflowId, workspaceId);
  compileWorkflowDefinition({
    workflowId,
    version: detail.latestVersion,
    definition: detail.definition,
  });
  const [workflow] = await db
    .update(workflows)
    .set({
      status: "active",
      activeVersion: detail.latestVersion,
      updatedAt: new Date(),
    })
    .where(eq(workflows.id, workflowId))
    .returning();
  return workflow;
}

export async function archiveWorkflow(workflowId: string, workspaceId: string) {
  const existing = await requireWorkflow(workflowId, workspaceId);
  const [workflow] = await db
    .update(workflows)
    .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(workflows.id, existing.id))
    .returning();
  return workflow;
}

export async function createWorkflowRun(input: {
  workflowId: string;
  workspaceId: string;
  userId: string;
  payload?: unknown;
  useLatestDraft?: boolean;
  idempotencyKey?: string;
}) {
  const workflow = await requireWorkflow(input.workflowId, input.workspaceId);
  const versionNumber = input.useLatestDraft
    ? workflow.latestVersion
    : workflow.activeVersion;
  if (!versionNumber) {
    throw new WorkflowConflictError(
      "Publish the workflow before executing it through the API.",
    );
  }
  const existingRun = await findIdempotentWorkflowRun({
    workflowId: workflow.id,
    idempotencyKey: input.idempotencyKey,
  });
  if (existingRun) return existingRun;
  const [version] = await db
    .select()
    .from(workflowVersions)
    .where(
      and(
        eq(workflowVersions.workflowId, workflow.id),
        eq(workflowVersions.version, versionNumber),
      ),
    )
    .limit(1);
  if (!version) throw new WorkflowConflictError("Workflow version is missing");
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workspaceId: input.workspaceId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      triggeredById: input.userId,
      trigger: "api",
      inputJson: input.payload ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .onConflictDoNothing({
      target: [workflowRuns.workflowId, workflowRuns.idempotencyKey],
    })
    .returning();
  if (!run && input.idempotencyKey) {
    const concurrentRun = await findIdempotentWorkflowRun({
      workflowId: workflow.id,
      idempotencyKey: input.idempotencyKey,
    });
    if (concurrentRun) return concurrentRun;
  }
  if (!run) throw new Error("Failed to create workflow run");
  try {
    await enqueueWorkflowRun(run.id);
  } catch (error) {
    await db
      .update(workflowRuns)
      .set({
        status: "failed",
        error: errorMessage(error),
        completedAt: new Date(),
      })
      .where(eq(workflowRuns.id, run.id));
    throw new WorkflowQueueError("Workflow queue is unavailable");
  }
  return run;
}

export async function listWorkflowRuns(
  workflowId: string,
  workspaceId: string,
) {
  await requireWorkflow(workflowId, workspaceId);
  return db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRuns.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(workflowRuns.queuedAt))
    .limit(50);
}

export async function getWorkflowRun(runId: string, workspaceId: string) {
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!run) throw new WorkflowNotFoundError("Workflow run not found");
  const steps = await db
    .select()
    .from(workflowRunSteps)
    .where(eq(workflowRunSteps.runId, run.id))
    .orderBy(asc(workflowRunSteps.startedAt));
  return { ...run, steps };
}

async function persistRunEvent(input: {
  runId: string;
  definition: WorkflowDefinition;
  event: FlowcraftEvent;
}) {
  const { event, runId, definition } = input;
  if (
    event.type !== "node:start" &&
    event.type !== "node:finish" &&
    event.type !== "node:error" &&
    event.type !== "node:retry" &&
    event.type !== "node:skipped"
  ) {
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
      .where(
        and(
          eq(workflowRunSteps.runId, runId),
          eq(workflowRunSteps.nodeId, node.id),
        ),
      );
    return;
  }
  const status =
    event.type === "node:finish"
      ? "completed"
      : event.type === "node:skipped"
        ? "skipped"
        : "failed";
  await db
    .update(workflowRunSteps)
    .set({
      status,
      ...(event.type === "node:finish"
        ? { outputJson: event.payload.result.output ?? null }
        : {}),
      ...(event.type === "node:error"
        ? { error: errorMessage(event.payload.error) }
        : {}),
      completedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRunSteps.runId, runId),
        eq(workflowRunSteps.nodeId, node.id),
      ),
    );
}

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
    const eventBus = createWorkflowEventBus((event) =>
      persistRunEvent({ runId, definition, event }),
    );
    const runtime = createWorkflowRuntime({
      dependencies: {
        workspaceId: record.run.workspaceId,
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
    const failure = result.errors?.map((error) => error.message).join(" ");
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
