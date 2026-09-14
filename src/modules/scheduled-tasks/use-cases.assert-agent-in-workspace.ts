import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

import { canUseAgent, getAgentById } from "@/modules/agent/use-cases";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  scheduledTasks,
  workflowRuns,
} from "@/server/infrastructure/db/schema";
import {
  ScheduledTaskInput,
  ScheduledTaskInputError,
  UpdateScheduledTaskInput,
  computeNextRunAt,
  normalizeTaskInput,
} from "./use-cases.scheduled-task-frequency";

export async function assertAgentInWorkspace(
  agentId: string,
  workspaceId: string,
  userId?: string,
) {
  const agent = await getAgentById(agentId, workspaceId);
  if (!agent) throw new Error("Agent not found");
  if (userId && !canUseAgent(agent, userId)) throw new Error("Agent not found");
  return agent;
}

export async function listScheduledTasks(
  workspaceId: string,
  userId: string,
  directlyAccessibleIds: string[] = [],
) {
  const visibleTaskCondition = directlyAccessibleIds.length
    ? or(
        eq(scheduledTasks.userId, userId),
        inArray(scheduledTasks.id, directlyAccessibleIds),
      )
    : eq(scheduledTasks.userId, userId);
  const tasks = await db
    .select()
    .from(scheduledTasks)
    .where(
      and(eq(scheduledTasks.workspaceId, workspaceId), visibleTaskCondition),
    )
    .orderBy(asc(scheduledTasks.nextRunAt));
  const runIds = tasks.flatMap((task) =>
    task.lastWorkflowRunId ? [task.lastWorkflowRunId] : [],
  );
  if (!runIds.length) return tasks;
  const runs = await db
    .select({
      id: workflowRuns.id,
      status: workflowRuns.status,
      error: workflowRuns.error,
    })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workspaceId, workspaceId),
        inArray(workflowRuns.id, runIds),
      ),
    );
  return tasks.map((task) => {
    const run = runs.find((run) => run.id === task.lastWorkflowRunId);
    return run
      ? {
          ...task,
          lastStatus:
            run.status === "completed"
              ? "success"
              : run.status === "cancelled"
                ? "failed"
                : run.status,
          lastError: run.error,
        }
      : task;
  });
}

export async function createScheduledTask(input: ScheduledTaskInput) {
  const normalized = normalizeTaskInput(input);
  await assertScheduledTarget(normalized);
  const nextRunAt = computeNextRunAt(normalized);
  const [task] = await db
    .insert(scheduledTasks)
    .values({
      workspaceId: normalized.workspaceId,
      userId: normalized.userId,
      agentId: normalized.agentId ?? null,
      workflowId: normalized.workflowId ?? null,
      workflowInputJson: normalized.workflowInput ?? null,
      conversationId: normalized.conversationId || null,
      title: normalized.title,
      prompt: normalized.prompt,
      frequency: normalized.frequency,
      timezone: normalized.timezone,
      timeOfDay: normalized.timeOfDay,
      intervalMinutes: normalized.intervalMinutes,
      enabled: normalized.enabled ?? true,
      nextRunAt,
    })
    .returning();
  return task;
}

export async function updateScheduledTask(
  taskId: string,
  workspaceId: string,
  userId: string,
  input: UpdateScheduledTaskInput,
  options: { allowShared?: boolean } = {},
) {
  const ownerCondition = options.allowShared
    ? undefined
    : eq(scheduledTasks.userId, userId);
  const [existing] = await db
    .select()
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.id, taskId),
        eq(scheduledTasks.workspaceId, workspaceId),
        ownerCondition,
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Scheduled task not found");

  const merged = normalizeTaskInput({
    workspaceId,
    userId,
    agentId: input.agentId === undefined ? existing.agentId : input.agentId,
    workflowId:
      input.workflowId === undefined ? existing.workflowId : input.workflowId,
    workflowInput:
      input.workflowInput === undefined
        ? existing.workflowInputJson
        : input.workflowInput,
    conversationId: input.conversationId ?? existing.conversationId,
    title: input.title ?? existing.title,
    prompt: input.prompt ?? existing.prompt,
    frequency: input.frequency ?? existing.frequency,
    timezone: input.timezone ?? existing.timezone,
    timeOfDay: input.timeOfDay ?? existing.timeOfDay,
    intervalMinutes: input.intervalMinutes ?? existing.intervalMinutes,
    enabled: input.enabled ?? existing.enabled,
  });
  await assertScheduledTarget(merged);
  if (existing.userId !== userId)
    await assertScheduledTarget({ ...merged, userId: existing.userId });
  const nextRunAt = computeNextRunAt(merged);

  const [task] = await db
    .update(scheduledTasks)
    .set({
      agentId: merged.agentId ?? null,
      workflowId: merged.workflowId ?? null,
      workflowInputJson: merged.workflowInput ?? null,
      conversationId: merged.conversationId || null,
      title: merged.title,
      prompt: merged.prompt,
      frequency: merged.frequency,
      timezone: merged.timezone,
      timeOfDay: merged.timeOfDay,
      intervalMinutes: merged.intervalMinutes,
      enabled: merged.enabled,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(scheduledTasks.id, taskId))
    .returning();
  return task;
}

export async function deleteScheduledTask(
  taskId: string,
  workspaceId: string,
  userId: string,
  options: { allowShared?: boolean } = {},
) {
  const ownerCondition = options.allowShared
    ? undefined
    : eq(scheduledTasks.userId, userId);
  await db
    .delete(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.id, taskId),
        eq(scheduledTasks.workspaceId, workspaceId),
        ownerCondition,
      ),
    );
}

export async function ensureConversationForTask(
  task: typeof scheduledTasks.$inferSelect,
  agentVersionId: string | null,
) {
  if (!task.agentId)
    throw new Error("Workflow schedules do not create conversations");
  if (task.conversationId) {
    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, task.conversationId),
          eq(conversations.workspaceId, task.workspaceId),
          eq(conversations.userId, task.userId),
          eq(conversations.status, "active"),
          isNull(conversations.archivedAt),
        ),
      )
      .limit(1);
    if (existing) return existing.id;
  }

  const [conversation] = await db
    .insert(conversations)
    .values({
      workspaceId: task.workspaceId,
      agentId: task.agentId,
      agentVersionId,
      userId: task.userId,
      title: task.title,
      status: "active",
    })
    .returning();

  await db
    .update(scheduledTasks)
    .set({ conversationId: conversation.id, updatedAt: new Date() })
    .where(eq(scheduledTasks.id, task.id));

  return conversation.id;
}

export async function assertScheduledTarget(input: ScheduledTaskInput) {
  if (!input.workflowId) {
    if (!input.agentId) throw new Error("Agent not found");
    await assertAgentInWorkspace(
      input.agentId,
      input.workspaceId,
      input.userId,
    );
    return;
  }
  const { hasResourcePermissionForRequest } =
    await import("@/modules/auth/workspace-access");
  const allowed = await hasResourcePermissionForRequest(
    input.userId,
    input.workspaceId,
    "workflows.execute",
    "workflow",
    input.workflowId,
  );
  if (!allowed) throw new ScheduledTaskInputError("Missing permission: workflows.execute", 403);
  const { getWorkflowDetail } = await import("@/modules/workflows/use-cases");
  const workflow = await getWorkflowDetail(input.workflowId, input.workspaceId);
  if (!workflow.activeVersion || workflow.status === "archived")
    throw new ScheduledTaskInputError("Publish the workflow before scheduling it", 409);
}
