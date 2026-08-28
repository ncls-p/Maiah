import { encryptValue } from "@/lib/crypto";
import { calculateOrchestrationUsageImpact } from "@/modules/agent/orchestration-usage-impact";
import { executeAgent } from "@/modules/agent/runtime-executor";
import { chatStreamIdempotencyKey } from "@/modules/chat/chat-stream-lease";
import type { createGenerationClock } from "@/modules/chat/generation-clock";
import { normalizeChatMessageMetrics } from "@/modules/chat/message-metrics";
import { getUsageImpactSetting } from "@/modules/provider/usage-impact-settings";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";

import { accumulateTokenCount } from "./route.accumulate-token-count";
import type { ChatExecutionContext } from "./route.execution-context";
import type { createOrchestrationProgress } from "./route.orchestration-progress";
import { projectOrchestrationProgress } from "./route.orchestration-progress";

type GenerationClock = ReturnType<typeof createGenerationClock>;
type OrchestrationProgress = ReturnType<typeof createOrchestrationProgress>;
type CompletedAgentRun = Awaited<ReturnType<typeof executeAgent>>;

export async function runOrchestratorChatCore(input: {
  context: ChatExecutionContext;
  streamGenerationId: string;
  streamAbortController: AbortController;
  enqueueEvent: (event: Record<string, unknown>) => void;
  generationClock: GenerationClock;
  progress: OrchestrationProgress;
  initialSortOrder: number;
  completedRun: { current: CompletedAgentRun | null };
}): Promise<void> {
  const {
    context,
    streamGenerationId,
    streamAbortController,
    enqueueEvent,
    generationClock,
    progress,
    initialSortOrder,
    completedRun,
  } = input;
  const {
    agent,
    actorUserId,
    agentId,
    version,
    conversation,
    assistantMessage,
    continuationClaim,
    content,
    generationHistory,
    availableAttachments,
  } = context;
  const result = await executeAgent({
    workspaceId: agent.workspaceId,
    userId: actorUserId,
    agentId,
    agentVersionId: version.id,
    prompt: content,
    messages: generationHistory,
    availableAttachments,
    trigger: "chat",
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    idempotencyKey: chatStreamIdempotencyKey(
      assistantMessage.id,
      streamGenerationId,
    ),
    abortSignal: streamAbortController.signal,
    onProgress: (event) => {
      generationClock.observe(
        event.type === "tool-start" ? "tool-call" : "tool-result",
        event.toolCallId || event.id,
      );
      progress.queue(event);
    },
    reasoningEffort: context.reasoningEffort,
  });
  completedRun.current = result;
  const timings = generationClock.snapshot();
  await progress.flush();
  const usageImpactSetting = await getUsageImpactSetting();
  const usageImpact = await calculateOrchestrationUsageImpact(
    result.usageBreakdown ?? [
      {
        modelId: version.modelId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    ],
    usageImpactSetting.co2GramsPerKwh,
  );
  const completedAt = new Date();
  const encryptedText = result.text
    ? await encryptValue(result.text)
    : null;
  const durableDelegationParts = await Promise.all(
    progress.durableDelegationProgress.map(
      async ({ progress: event, sortOrder }) => {
        const projected = projectOrchestrationProgress(event);
        return {
          messageId: assistantMessage.id,
          type: projected.isStart
            ? ("tool-call" as const)
            : ("tool-result" as const),
          contentEncrypted: await encryptValue(
            JSON.stringify(projected.rawMetadata),
          ),
          metadataJson: projected.safeMetadata,
          sortOrder,
        };
      },
    ),
  );
  const completed = await db.transaction(async (tx) => {
    const [transitioned] = await tx
      .update(messages)
      .set({
        status: "completed",
        tokenInput: accumulateTokenCount(
          continuationClaim?.message.tokenInput ?? null,
          usageImpact.inputTokens,
        ),
        tokenOutput: accumulateTokenCount(
          continuationClaim?.message.tokenOutput ?? null,
          usageImpact.outputTokens,
        ),
        completedAt,
        streamLeaseExpiresAt: null,
      })
      .where(
        and(
          eq(messages.id, assistantMessage.id),
          eq(messages.status, "streaming"),
          eq(messages.streamGenerationId, streamGenerationId),
        ),
      )
      .returning({ id: messages.id });
    if (!transitioned) return false;
    if (durableDelegationParts.length > 0)
      await tx.insert(messageParts).values(durableDelegationParts);
    if (
      result.text &&
      continuationClaim?.appendableTextPart &&
      progress.nextSortOrder === initialSortOrder
    ) {
      await tx
        .update(messageParts)
        .set({
          contentEncrypted: await encryptValue(
            `${continuationClaim.appendableTextPart.content}${result.text}`,
          ),
        })
        .where(
          eq(messageParts.id, continuationClaim.appendableTextPart.id),
        );
    } else if (encryptedText) {
      await tx.insert(messageParts).values({
        messageId: assistantMessage.id,
        type: "text",
        contentEncrypted: encryptedText,
        sortOrder: progress.allocateSortOrder(),
      });
    }
    if (usageImpactSetting.enabled) {
      await tx.insert(messageParts).values({
        messageId: assistantMessage.id,
        type: "impact",
        contentEncrypted: await encryptValue(JSON.stringify(usageImpact)),
        metadataJson: usageImpact,
        sortOrder: progress.allocateSortOrder(),
      });
    }
    await tx
      .update(conversations)
      .set({
        agentId,
        agentVersionId: version.id,
        sidebarOrder: null,
        updatedAt: completedAt,
      })
      .where(eq(conversations.id, conversation.id));
    return true;
  });
  if (!completed) return;
  if (result.text) enqueueEvent({ type: "text", delta: result.text });
  if (usageImpactSetting.enabled)
    enqueueEvent({ type: "impact", impact: usageImpact });
  enqueueEvent({
    type: "done",
    metrics: normalizeChatMessageMetrics({
      inputTokens:
        (continuationClaim?.message.tokenInput ?? 0) +
        usageImpact.inputTokens,
      outputTokens:
        (continuationClaim?.message.tokenOutput ?? 0) +
        usageImpact.outputTokens,
      totalTokens:
        (continuationClaim?.message.tokenInput ?? 0) +
        usageImpact.inputTokens +
        (continuationClaim?.message.tokenOutput ?? 0) +
        usageImpact.outputTokens,
      durationMs: timings.durationMs,
      timeToFirstTokenMs: timings.timeToFirstTokenMs,
      generationMs: timings.generationMs,
      toolMs: timings.toolMs,
      thinkingMs: timings.thinkingMs,
    }),
  });
}