import { and,asc,eq,lte } from "drizzle-orm";

import { encryptValue } from "@/lib/crypto";
import { logHandledError,logHandledWarning } from "@/lib/logger";
import { executeAgent } from "@/modules/agent/runtime-executor";
import { getActiveVersion } from "@/modules/agent/use-cases";
import { getBuiltInToolByName } from "@/modules/tool/builtin-tools";
import { db } from "@/server/infrastructure/db";
import { conversations,messageParts,messages,scheduledTasks } from "@/server/infrastructure/db/schema";
import { assertAgentInWorkspace,ensureConversationForTask } from "./use-cases.assert-agent-in-workspace";
import { MAX_DUE_TASKS_PER_TICK,computeNextRunAt } from "./use-cases.scheduled-task-frequency";

async function buildSearchContext(prompt: string) {
  const webSearch = getBuiltInToolByName("web_search");
  if (!webSearch) return null;
  try {
    const input = webSearch.inputSchema.parse({
      query: prompt,
      limit: 8,
      language: "fr",
    });
    const result = await (webSearch.execute as (value: unknown) => unknown)(input);
    return JSON.stringify(result, null, 2).slice(0, 12_000);
  } catch (error) {
    logHandledWarning("Scheduled task web search failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function insertMessage(input: { conversationId: string; role: "user" | "assistant"; content: string; modelId?: string | null; providerId?: string | null; tokenInput?: number | null; tokenOutput?: number | null }) {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      status: "completed",
      modelId: input.modelId || null,
      providerId: input.providerId || null,
      tokenInput: input.tokenInput ?? null,
      tokenOutput: input.tokenOutput ?? null,
      completedAt: new Date(),
    })
    .returning();

  await db.insert(messageParts).values({
    messageId: message.id,
    type: "text",
    contentEncrypted: await encryptValue(input.content),
    sortOrder: 0,
  });

  await db.update(conversations).set({ updatedAt: new Date(), sidebarOrder: null }).where(eq(conversations.id, input.conversationId));

  return message;
}

async function runScheduledTask(task: typeof scheduledTasks.$inferSelect) {
  const agent = await assertAgentInWorkspace(task.agentId, task.workspaceId, task.userId);
  const version = await getActiveVersion(task.agentId);
  if (!version) throw new Error("Agent has no active version");

  const conversationId = await ensureConversationForTask(task, version.id);
  const prompt = `Tâche planifiée « ${task.title} »\n\n${task.prompt}`;
  await insertMessage({ conversationId, role: "user", content: prompt });

  const searchContext = await buildSearchContext(task.prompt);
  const executionPrompt = [prompt, "Tu exécutes une tâche planifiée automatiquement. Réponds directement dans le chat avec un contenu utile, daté, concis et actionnable. Si un contexte web est fourni, cite les sources importantes par URL.", searchContext ? `Contexte web récupéré juste avant l'exécution:\n${searchContext}` : null].filter(Boolean).join("\n\n");
  const result = await executeAgent({
    workspaceId: task.workspaceId,
    userId: task.userId,
    agentId: task.agentId,
    agentVersionId: version.id,
    prompt: executionPrompt,
    trigger: "scheduled",
    conversationId,
    scheduledTaskId: task.id,
    idempotencyKey: `${task.id}:${task.nextRunAt.toISOString()}`,
  });

  const assistantText = result.text.trim() || "La tâche planifiée n'a produit aucun contenu.";
  await insertMessage({
    conversationId,
    role: "assistant",
    content: assistantText,
    modelId: version.modelId ?? undefined,
    providerId: version.providerId ?? undefined,
    tokenInput: result.inputTokens,
    tokenOutput: result.outputTokens,
  });

  await db
    .update(conversations)
    .set({
      agentId: agent.id,
      agentVersionId: version.id,
      sidebarOrder: null,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));
}

export async function processDueScheduledTasks(now = new Date()) {
  const dueTasks = await db
    .select()
    .from(scheduledTasks)
    .where(and(eq(scheduledTasks.enabled, true), lte(scheduledTasks.nextRunAt, now)))
    .orderBy(asc(scheduledTasks.nextRunAt))
    .limit(MAX_DUE_TASKS_PER_TICK);

  for (const task of dueTasks) {
    const nextRunAt = computeNextRunAt({
      frequency: task.frequency,
      timezone: task.timezone,
      timeOfDay: task.timeOfDay,
      intervalMinutes: task.intervalMinutes,
      from: now,
    });
    await db
      .update(scheduledTasks)
      .set({
        lastRunAt: now,
        lastStatus: "running",
        lastError: null,
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(scheduledTasks.id, task.id));

    try {
      await runScheduledTask(task);
      await db.update(scheduledTasks).set({ lastStatus: "success", updatedAt: new Date() }).where(eq(scheduledTasks.id, task.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logHandledError("Scheduled task failed", {
        taskId: task.id,
        workspaceId: task.workspaceId,
        error: message,
      });
      await db
        .update(scheduledTasks)
        .set({
          lastStatus: "failed",
          lastError: message.slice(0, 4_000),
          updatedAt: new Date(),
        })
        .where(eq(scheduledTasks.id, task.id));
    }
  }

  return dueTasks.length;
}
