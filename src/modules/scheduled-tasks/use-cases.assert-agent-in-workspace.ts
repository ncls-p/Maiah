import { and,asc,eq,inArray,isNull,or } from "drizzle-orm";

import {
canUseAgent,
getAgentById
} from "@/modules/agent/use-cases";
import { db } from "@/server/infrastructure/db";
import {
conversations,
scheduledTasks
} from "@/server/infrastructure/db/schema";
import {
ScheduledTaskInput,
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
  return db
    .select()
    .from(scheduledTasks)
    .where(
      and(eq(scheduledTasks.workspaceId, workspaceId), visibleTaskCondition),
    )
    .orderBy(asc(scheduledTasks.nextRunAt));
}

export async function createScheduledTask(input: ScheduledTaskInput) {
  const normalized = normalizeTaskInput(input);
  await assertAgentInWorkspace(
    normalized.agentId,
    normalized.workspaceId,
    normalized.userId,
  );
  const nextRunAt = computeNextRunAt(normalized);
  const [task] = await db
    .insert(scheduledTasks)
    .values({
      workspaceId: normalized.workspaceId,
      userId: normalized.userId,
      agentId: normalized.agentId,
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
    agentId: input.agentId ?? existing.agentId,
    conversationId: input.conversationId ?? existing.conversationId,
    title: input.title ?? existing.title,
    prompt: input.prompt ?? existing.prompt,
    frequency: input.frequency ?? existing.frequency,
    timezone: input.timezone ?? existing.timezone,
    timeOfDay: input.timeOfDay ?? existing.timeOfDay,
    intervalMinutes: input.intervalMinutes ?? existing.intervalMinutes,
    enabled: input.enabled ?? existing.enabled,
  });
  await assertAgentInWorkspace(merged.agentId, workspaceId, userId);
  const nextRunAt = computeNextRunAt(merged);

  const [task] = await db
    .update(scheduledTasks)
    .set({
      agentId: merged.agentId,
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
